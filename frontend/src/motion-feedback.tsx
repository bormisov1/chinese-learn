import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function useReducedMotion() {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => setReduced(false));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => subscription.remove();
  }, []);
  return reduced;
}

export function DeckLoadingAnimation() {
  const reduced = useReducedMotion();
  const cards = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduced === null) return;
    cards.forEach(value => value.setValue(reduced ? 1 : 0));
    if (reduced) return;
    const animation = Animated.stagger(85, cards.map(value => Animated.spring(value, {
      toValue: 1,
      speed: 17,
      bounciness: 7,
      useNativeDriver: true,
    })));
    animation.start();
    return () => animation.stop();
  }, [cards, reduced]);
  const glyphs = ['学', '好', '你'];
  return <View accessibilityLabel="Loading your deck" style={styles.deckLoader}>
    <View style={styles.deckStack}>
      {cards.map((value, index) => <Animated.View key={index} style={[
        styles.deckCard,
        {
          zIndex: index,
          transform: [
            { translateX: (index - 1) * 13 },
            { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [28, index * -5] }) },
            { rotate: value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(index - 1) * 4}deg`] }) },
            { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
          ],
          opacity: value,
        },
      ]}><Text style={styles.deckGlyph}>{glyphs[index]}</Text></Animated.View>)}
    </View>
  </View>;
}

const sparkVectors = [
  [-44, -24], [-18, -42], [20, -42], [46, -18], [43, 24], [17, 42], [-23, 39], [-46, 14],
] as const;

export function SuccessSparks() {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced === null) return;
    progress.setValue(reduced ? 1 : 0);
    if (reduced) return;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 560,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced]);
  if (reduced) return null;
  return <View pointerEvents="none" style={styles.sparkLayer}>
    <View style={styles.sparkOrigin}>
      {sparkVectors.map(([x, y], index) => <Animated.View key={index} style={[
        styles.spark,
        index % 2 ? styles.sparkCoral : styles.sparkGreen,
        {
          opacity: progress.interpolate({ inputRange: [0, 0.12, 0.72, 1], outputRange: [0, 1, 0.8, 0] }),
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, y] }) },
            { scale: progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.2, 1, 0.35] }) },
          ],
        },
      ]} />)}
    </View>
  </View>;
}

export function ListeningSuccessWave() {
  const reduced = useReducedMotion();
  const bars = useRef([0, 1, 2, 3, 4, 5, 6].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduced === null) return;
    bars.forEach(value => value.setValue(reduced ? 1 : 0));
    if (reduced) return;
    const animation = Animated.stagger(35, bars.map(value => Animated.spring(value, {
      toValue: 1,
      speed: 20,
      bounciness: 10,
      useNativeDriver: true,
    })));
    animation.start();
    return () => animation.stop();
  }, [bars, reduced]);
  const heights = [14, 24, 34, 42, 32, 23, 14];
  return <View pointerEvents="none" accessibilityLabel="Correct answer" style={styles.wave}>
    {bars.map((value, index) => <Animated.View key={index} style={[
      styles.waveBar,
      {
        height: heights[index],
        opacity: value,
        transform: [{ scaleY: value.interpolate({ inputRange: [0, 1], outputRange: [0.18, 1] }) }],
      },
    ]} />)}
  </View>;
}

export function ImportConfirmationMark({ delay = 0 }: { delay?: number }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced === null) return;
    progress.setValue(reduced ? 1 : 0);
    if (reduced) return;
    const animation = Animated.spring(progress, {
      toValue: 1,
      delay,
      speed: 22,
      bounciness: 10,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, progress, reduced]);
  return <Animated.View accessibilityLabel="Imported" style={[
    styles.importMark,
    {
      opacity: progress,
      transform: [
        { scale: progress },
        { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] }) },
      ],
    },
  ]}><Ionicons name="checkmark" size={17} color={colors.white} /></Animated.View>;
}

export function RoundCompletionRing({ correct, total, onComplete }: {
  correct: number;
  total: number;
  onComplete: () => void;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const circumference = 2 * Math.PI * 42;
  useEffect(() => {
    if (reduced === null) return;
    progress.setValue(reduced ? 1 : 0);
    if (reduced) {
      onCompleteRef.current();
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 1240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) onCompleteRef.current();
    });
    return () => animation.stop();
  }, [progress, reduced]);
  return <View accessibilityLabel={`Round complete. ${correct} of ${total} correct.`} style={styles.roundCompletionOverlay}>
    <View style={styles.roundRingLarge}>
      <View style={styles.roundRing}>
        <Svg width={104} height={104} style={StyleSheet.absoluteFillObject}>
          <Circle cx={52} cy={52} r={42} fill="none" stroke={colors.line} strokeWidth={7} />
          <AnimatedCircle
            cx={52}
            cy={52}
            r={42}
            fill="none"
            stroke={colors.green}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] }) as any}
            rotation={-90}
            origin="52, 52"
          />
        </Svg>
        <Animated.View style={{ opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }}>
          <Text style={styles.roundRingCount}>{correct}/{total}</Text>
          <Ionicons name="checkmark" size={18} color={colors.green} style={styles.roundRingCheck} />
        </Animated.View>
      </View>
    </View>
  </View>;
}

export function GraduationSeal({ status, onComplete }: {
  status: 'pending' | 'active' | 'complete';
  onComplete: () => void;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  useEffect(() => {
    if (reduced === null) return;
    if (reduced) {
      progress.setValue(1);
      if (status === 'active') onCompleteRef.current();
      return;
    }
    if (status !== 'active') {
      progress.setValue(status === 'complete' ? 1 : 0);
      return;
    }
    progress.setValue(0);
    const animation = Animated.spring(progress, {
      toValue: 1,
      speed: 6,
      bounciness: 8,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onCompleteRef.current();
    });
    return () => animation.stop();
  }, [progress, reduced, status]);
  return <Animated.View accessibilityLabel="Word graduated" style={[
    styles.graduationSeal,
    {
      opacity: progress,
      transform: [
        { scale: progress.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1.55, 0.92, 1] }) },
        { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '-5deg'] }) },
      ],
    },
  ]}>
    <Text style={styles.graduationHanzi}>毕业</Text>
    <Text style={styles.graduationLabel}>LEARNED</Text>
  </Animated.View>;
}

const styles = StyleSheet.create({
  deckLoader: { alignItems: 'center', justifyContent: 'center' },
  deckStack: { width: 120, height: 104, alignItems: 'center', justifyContent: 'center' },
  deckCard: { position: 'absolute', width: 72, height: 86, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, shadowColor: colors.ink, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  deckGlyph: { color: colors.green, fontSize: 34, fontWeight: '700' },
  sparkLayer: { ...StyleSheet.absoluteFillObject, zIndex: 20, alignItems: 'center', justifyContent: 'center' },
  sparkOrigin: { width: 1, height: 1, transform: [{ scale: 3 }] },
  spark: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  sparkGreen: { backgroundColor: colors.green },
  sparkCoral: { backgroundColor: colors.coral },
  wave: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 4 },
  waveBar: { width: 4, borderRadius: 3, backgroundColor: colors.green },
  importMark: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green },
  roundCompletionOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  roundRingLarge: { width: 312, height: 312, alignItems: 'center', justifyContent: 'center' },
  roundRing: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center', transform: [{ scale: 3 }] },
  roundRingCount: { color: colors.ink, fontSize: 20, lineHeight: 24, fontWeight: '900', textAlign: 'center' },
  roundRingCheck: { alignSelf: 'center' },
  graduationSeal: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: colors.green, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  graduationHanzi: { color: colors.green, fontSize: 16, lineHeight: 19, fontWeight: '900' },
  graduationLabel: { color: colors.green, fontSize: 6, fontWeight: '900', letterSpacing: 0.5 },
});
