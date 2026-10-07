import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './i18n';

type MissingApiKeyPromptContext = { showMissingApiKeyPrompt: () => void };
const Context = createContext<MissingApiKeyPromptContext | null>(null);

export function useMissingApiKeyPrompt(): MissingApiKeyPromptContext {
  const prompt = useContext(Context);
  if (!prompt) throw new Error('MissingApiKeyPromptProvider is required.');
  return prompt;
}

export function MissingApiKeyPromptProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const showMissingApiKeyPrompt = useCallback(() => setVisible(true), []);
  const context = useMemo(() => ({ showMissingApiKeyPrompt }), [showMissingApiKeyPrompt]);
  const openSettings = () => {
    setVisible(false);
    router.navigate({ pathname: '/settings', params: { focus: 'deepseek-key', request: String(Date.now()) } });
  };

  return <Context.Provider value={context}>
    {children}
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={() => setVisible(false)} />
        <View style={styles.alert} accessibilityViewIsModal>
          <View style={styles.content}>
            <Text style={styles.title}>DeepSeek API key required</Text>
            <Text style={styles.message}>A DeepSeek API key is required to use AI features. Add your key in Settings to continue.</Text>
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={styles.action}>
              <Text style={styles.actionText}>Close</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={openSettings} style={[styles.action, styles.settingsAction]}>
              <Text style={[styles.actionText, styles.primaryActionText]}>Open Settings</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </Context.Provider>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.35)', paddingHorizontal: 32 },
  alert: { width: '100%', maxWidth: 320, overflow: 'hidden', borderRadius: 14, backgroundColor: '#F7F7F9' },
  content: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 21, paddingBottom: 21 },
  title: { color: '#1C1C1E', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  message: { color: '#1C1C1E', fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 8 },
  actions: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#B8B8BE' },
  action: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  settingsAction: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: '#B8B8BE' },
  actionText: { color: '#007AFF', fontSize: 17 },
  primaryActionText: { fontWeight: '600' },
});
