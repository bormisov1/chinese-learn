import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { useStore } from './context';
import { explanationKey, type ExplanationKind } from './word-explanations';
import { translate } from './i18n';

export function ExplanationButton({ kind, text, size = 22, inverted = false, onOpen }: { kind: ExplanationKind; text: string; size?: number; inverted?: boolean; onOpen?: () => void }) {
  const { data } = useStore();
  const cached = !!data.explanations?.[explanationKey(kind, text, data.settings.language)];
  return <Pressable accessibilityRole="button" accessibilityLabel={`${translate(data.settings.language, cached ? 'Cached explanation for' : 'Get explanation for')} ${text}`}
    accessibilityHint="Opens explanation details"
    onPress={(event) => { event.stopPropagation(); onOpen?.(); router.push({ pathname: '/explanation', params: { kind, text } }); }}
    hitSlop={8} style={{ padding: 4, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={cached ? 'information-circle' : 'information-circle-outline'} size={size} color={inverted ? cached ? '#FFFFFF' : '#CBDDD5' : cached ? '#31735C' : '#9A9D95'} />
  </Pressable>;
}
