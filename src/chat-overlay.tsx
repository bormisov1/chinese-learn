import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from './context';
import { Text } from './i18n';
import { CHAT_PRESETS, ChatPreset, ChatReply, ChatTurn, requestChatReply } from './chat';
import { colors } from './theme';

type Message = { role: 'user'; text: string } | { role: 'assistant'; text: string; reply: ChatReply };

export function ChatOverlay() {
  const { data, dictionary, importWords } = useStore();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<ChatPreset>('words');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saved = new Set(data.words.map(word => word.hanzi));

  const send = async () => {
    const question = input.trim();
    if (!question || busy) return;
    const next: Message[] = [...messages, { role: 'user', text: question }];
    const assistantIndex = next.length;
    setMessages([...next, { role: 'assistant', text: '', reply: { answer: '', words: [] } }]);
    setInput(''); setBusy(true); setError('');
    try {
      const history: ChatTurn[] = next.map(item => ({ role: item.role, content: item.text }));
      const reply = await requestChatReply(data.settings, preset, history, answer => {
        setMessages(current => current[assistantIndex]?.text === answer ? current : current.map((item, index) => index === assistantIndex && item.role === 'assistant' ? { ...item, text: answer } : item));
      });
      setMessages(current => current.map((item, index) => index === assistantIndex ? { role: 'assistant', text: reply.answer, reply } : item));
    } catch (reason) {
      setMessages(current => current.filter((_, index) => index !== assistantIndex || current[index].text));
      setError(reason instanceof Error ? reason.message : 'Chat request failed.');
    }
    finally { setBusy(false); }
  };

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Open DeepSeek chat" onPress={() => setOpen(true)} style={styles.launcher}>
      <View style={styles.launcherRing}><Ionicons name="hardware-chip-outline" size={25} color="#D9FFF4" /></View>
      <View style={styles.orbitDot} />
    </Pressable>
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={[styles.page, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>DEEPSEEK</Text><Text style={styles.title}>Chat</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close chat" onPress={() => setOpen(false)} style={styles.close}><Ionicons name="close" size={25} color={colors.ink} /></Pressable>
        </View>
        <ScrollView ref={scroll} style={styles.history} contentContainerStyle={styles.historyContent} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          {!messages.length && <Text style={styles.empty}>Ask about Chinese words, a Hanzi, or a message you want to answer.</Text>}
          {messages.map((item, index) => <View key={index} style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
            {!!item.text && <Text style={[styles.messageText, item.role === 'user' && styles.userText]}>{item.text}</Text>}
            {item.role === 'assistant' && !!item.reply.words.length && <View style={styles.wordsSection}>
              <Text style={styles.wordsTitle}>BREAKDOWN · TAP TO ADD</Text>
              {item.reply.words.map(word => {
                const added = saved.has(word.hanzi) || selectedWords.has(word.hanzi);
                return <Pressable key={word.hanzi} accessibilityRole="button" accessibilityLabel={`${added ? 'Added' : 'Add'} ${word.hanzi} to vocabulary`} accessibilityState={{ disabled: added }} disabled={added} onPress={() => { setSelectedWords(current => new Set(current).add(word.hanzi)); importWords([dictionary?.get(word.hanzi) ?? { hanzi: word.hanzi, pinyin: word.pinyin, russian: word.translation }]); }} style={[styles.wordRow, added && styles.wordAdded]}>
                  <Text style={[styles.hanzi, added && styles.wordTextAdded]}>{word.hanzi}</Text>
                  <View style={styles.wordDetail}><Text style={[styles.pinyin, added && styles.wordTextAdded]}>{word.pinyin}</Text><Text style={[styles.translation, added && styles.wordTextAdded]}>{word.translation}</Text></View>
                  <Ionicons name={added ? 'checkmark' : 'add'} size={16} color={added ? colors.green : colors.white} />
                </Pressable>;
              })}
            </View>}
          </View>)}
          {busy && <ActivityIndicator accessibilityLabel="Waiting for DeepSeek" color={colors.green} style={styles.loading} />}
          {!!error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
        <View style={styles.promptArea}>
          <Text style={styles.promptLabel}>CHOOSE A PROMPT</Text>
          <View style={styles.promptButtons}>{CHAT_PRESETS.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === preset }} onPress={() => setPreset(item.id)} style={[styles.promptButton, item.id === preset && styles.promptSelected]}><Text style={[styles.promptText, item.id === preset && styles.promptTextSelected]}>{item.label}</Text></Pressable>)}</View>
        </View>
        <View style={styles.composer}>
          <TextInput accessibilityLabel="Chat message" multiline value={input} onChangeText={setInput} placeholder="Type a message…" placeholderTextColor={colors.muted} style={styles.input} />
          <Pressable accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: !input.trim() || busy }} disabled={!input.trim() || busy} onPress={() => void send()} style={[styles.send, (!input.trim() || busy) && styles.sendDisabled]}><Ionicons name="arrow-up" size={23} color={colors.white} /></Pressable>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  launcher: { position: 'absolute', left: 15, bottom: 83, zIndex: 20, width: 51, height: 51, borderRadius: 26, opacity: 0.85, backgroundColor: 'rgba(16, 73, 72, 0.72)', borderWidth: 1, borderColor: 'rgba(157, 255, 226, 0.65)', alignItems: 'center', justifyContent: 'center', shadowColor: '#25E6BD', shadowOpacity: 0.35, shadowRadius: 10, elevation: 8 },
  launcherRing: { width: 38, height: 38, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(206, 255, 242, 0.45)', alignItems: 'center', justifyContent: 'center' },
  orbitDot: { position: 'absolute', right: 4, top: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: '#9FFFE0' },
  page: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 70, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  eyebrow: { fontSize: 10, letterSpacing: 2.2, fontWeight: '800', color: colors.green },
  title: { fontSize: 25, fontWeight: '800', color: colors.ink },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pale },
  promptArea: { padding: 15, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  promptLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.3, color: colors.muted, marginBottom: 10 },
  promptButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  promptButton: { borderRadius: 10, borderWidth: 1, borderColor: '#8AAE99', paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#E4F2E7' },
  promptSelected: { backgroundColor: colors.green, borderColor: colors.green },
  promptText: { fontSize: 13, fontWeight: '700', color: colors.green },
  promptTextSelected: { color: colors.white },
  history: { flex: 1 },
  historyContent: { padding: 16, paddingBottom: 28, gap: 15 },
  empty: { color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 48, paddingHorizontal: 20 },
  bubble: { maxWidth: '94%', padding: 15, borderRadius: 17 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.green, borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 4, width: '94%' },
  messageText: { fontSize: 18, lineHeight: 28, color: colors.ink },
  userText: { color: colors.white },
  wordsSection: { marginTop: 13, borderTopWidth: 1, borderColor: colors.line, paddingTop: 12, gap: 7 },
  wordsTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, color: colors.muted, marginBottom: 2 },
  wordRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 11, backgroundColor: colors.green, borderWidth: 1, borderColor: '#236E52' },
  wordAdded: { backgroundColor: '#D8EBDD', borderColor: '#A9CBB4' },
  wordTextAdded: { color: colors.green },
  hanzi: { fontSize: 24, fontWeight: '800', color: colors.white, minWidth: 44 },
  wordDetail: { flex: 1 },
  pinyin: { fontSize: 16, fontWeight: '700', color: colors.white },
  translation: { fontSize: 16, color: colors.white },
  loading: { alignSelf: 'flex-start', margin: 12 },
  error: { color: colors.red, fontSize: 14, lineHeight: 21 },
  composer: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  input: { flex: 1, maxHeight: 120, minHeight: 44, borderWidth: 1, borderColor: '#C5D8CD', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, color: colors.ink, fontSize: 16, backgroundColor: colors.paper },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green },
  sendDisabled: { opacity: 0.4 },
});
