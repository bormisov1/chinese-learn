import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useStore } from './context';
import { explanationKey, type ExplanationKind } from './word-explanations';
import { translate } from './i18n';

export function ExplanationButton({ kind, text, size = 22, inverted = false, onOpen }: { kind: ExplanationKind; text: string; size?: number; inverted?: boolean; onOpen?: () => void }) {
  const { data } = useStore();
  const cached = !!data.explanations?.[explanationKey(kind, text, data.settings.language)];
  const buttonSize = Math.max(34, size + 16);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${translate(data.settings.language, cached ? 'Cached explanation for' : 'Get explanation for')} ${text}`}
    accessibilityHint="Opens explanation details"
    onPress={(event) => { event.stopPropagation(); onOpen?.(); router.push({ pathname: '/explanation', params: { kind, text } }); }}
    hitSlop={8} style={[styles.button, { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2 }, inverted && styles.inverted, cached && (inverted ? styles.cachedInverted : styles.cached)]}>
    <Ionicons name="information-outline" size={size} color={inverted ? cached ? '#FFFFFF' : '#CBDDD5' : cached ? '#31735C' : '#75877F'} />
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: 1, borderColor: '#CCDCD1' },
  cached: { borderColor: '#9FC6AD' },
  inverted: { borderColor: '#CBDDD5' },
  cachedInverted: { borderColor: '#FFFFFF' },
});
