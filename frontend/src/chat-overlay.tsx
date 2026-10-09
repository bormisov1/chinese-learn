import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type GestureResponderEvent, type PointerEvent as NativePointerEvent, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from './context';
import { Text, TextInput } from './i18n';
import { CHAT_PRESETS, ChatPreset, ChatTurn, ChatWord, addableChatWords, chatTitleForQuestion, requestChatReply } from './chat';
import { CHAT_HISTORY_KEY, ChatMessage, Conversation, loadChatHistory, parseChatHistory, saveChatHistory } from './chat-history';
import { colors } from './theme';
import { removeVocabularyWord } from './vocabulary-selection';
import { useMissingApiKeyPrompt } from './missing-api-key-prompt';
import { CHAT_LAUNCHER_POSITION_KEY, ChatLauncherPosition, clampChatLauncherPosition, loadChatLauncherPosition, parseChatLauncherPosition, saveChatLauncherPosition } from './chat-launcher-position';

export function ChatOverlay() {
  const { data, dictionary, importWords, patch } = useStore();
  const { showMissingApiKeyPrompt } = useMissingApiKeyPrompt();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const [open, setOpen] = useState(false);
  const [webViewport, setWebViewport] = useState<{ height: number; top: number } | null>(null);
  const [launcherPressed, setLauncherPressed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>(() => Platform.OS === 'web' ? loadChatHistory() : []);
  const [activeId, setActiveId] = useState<string | null>(() => Platform.OS === 'web' ? loadChatHistory()[0]?.id ?? null : null);
  const [historyReady, setHistoryReady] = useState(Platform.OS === 'web');
  const [draftPreset, setDraftPreset] = useState<ChatPreset>('words');
  const [input, setInput] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<ChatWord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [launcherPosition, setLauncherPosition] = useState<ChatLauncherPosition | null>(() => Platform.OS === 'web' ? loadChatLauncherPosition() : null);
  const launcherPositionRef = useRef(launcherPosition);
  launcherPositionRef.current = launcherPosition;
  const launcherDrag = useRef<{ startX: number; startY: number; origin: ChatLauncherPosition; moved: boolean } | null>(null);
  const suppressLauncherPress = useRef(false);
  const launcherBounds = useRef({ width, height, top: insets.top, bottom: insets.bottom });
  launcherBounds.current = { width, height, top: insets.top, bottom: insets.bottom };
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const active = conversations.find(item => item.id === activeId);
  const messages = active?.messages ?? [];
  const visibleMessages = messages.filter(item => item.role === 'user' || !!item.text || !!item.reply.words.length);
  const preset = active?.preset ?? draftPreset;
  const saved = new Set(data.words.map(word => word.hanzi));
  const missingApiKey = !data.settings.apiKey.trim();

  const fitLauncher = (position: ChatLauncherPosition) => clampChatLauncherPosition(position, width, height, insets.top, insets.bottom);
  const persistLauncher = (position: ChatLauncherPosition) => {
    if (Platform.OS === 'web') saveChatLauncherPosition(position);
    else void AsyncStorage.setItem(CHAT_LAUNCHER_POSITION_KEY, JSON.stringify(position)).catch(() => {});
  };
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let mounted = true;
    void AsyncStorage.getItem(CHAT_LAUNCHER_POSITION_KEY).then(raw => {
      const position = parseChatLauncherPosition(raw);
      if (mounted && position) setLauncherPosition(position);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const current = launcherPositionRef.current;
    if (!current) return;
    const next = fitLauncher(current);
    if (next.x !== current.x || next.y !== current.y) {
      launcherPositionRef.current = next;
      setLauncherPosition(next);
      persistLauncher(next);
    }
  }, [width, height, insets.top, insets.bottom]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const move = (event: PointerEvent) => {
      const bounds = launcherBounds.current;
      moveLauncherTo(event.pageX, event.pageY, bounds.width, bounds.height, bounds.top, bounds.bottom);
    };
    const finish = () => finishLauncherDrag();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const viewport = window.visualViewport;
    const update = () => {
      const next = { height: viewport?.height ?? window.innerHeight, top: viewport?.offsetTop ?? 0 };
      setWebViewport(current => current?.height === next.height && current.top === next.top ? current : next);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const startLauncherDrag = (pageX: number, pageY: number) => {
    suppressLauncherPress.current = false;
    setLauncherPressed(true);
    launcherDrag.current = { startX: pageX, startY: pageY,
      origin: launcherPositionRef.current ?? { x: width - 51 - 15, y: insets.top + 14 }, moved: false };
  };
  const moveLauncherTo = (pageX: number, pageY: number, viewportWidth: number, viewportHeight: number, topInset: number, bottomInset: number) => {
    const drag = launcherDrag.current;
    if (!drag) return;
    const dx = pageX - drag.startX;
    const dy = pageY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 2) return;
    drag.moved = true;
    setLauncherPressed(false);
    suppressLauncherPress.current = true;
    const next = clampChatLauncherPosition({ x: drag.origin.x + dx, y: drag.origin.y + dy }, viewportWidth, viewportHeight, topInset, bottomInset);
    launcherPositionRef.current = next;
    setLauncherPosition(next);
  };
  const finishLauncherDrag = () => {
    setLauncherPressed(false);
    if (launcherDrag.current?.moved && launcherPositionRef.current) persistLauncher(launcherPositionRef.current);
    launcherDrag.current = null;
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let mounted = true;
    void AsyncStorage.getItem(CHAT_HISTORY_KEY).then(raw => {
      if (!mounted) return;
      const history = parseChatHistory(raw);
      setConversations(history);
      setActiveId(history[0]?.id ?? null);
    }).catch(() => { /* Chat remains usable if device storage is unavailable. */ })
      .finally(() => { if (mounted) setHistoryReady(true); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!historyReady) return;
    const timer = setTimeout(() => {
      if (Platform.OS === 'web') {
        try { saveChatHistory(conversations); } catch { /* Browser storage can be disabled. */ }
      } else void AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(conversations)).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [conversations, historyReady]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const flush = () => { try { saveChatHistory(conversationsRef.current); } catch { /* Storage can be disabled by the browser. */ } };
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('beforeunload', flush); flush(); };
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = '@keyframes chat-dot-flash { 0%, 20%, 100% { opacity: .22; } 50% { opacity: 1; } } .chat-typing { color: #326448; font-style: italic; font-size: 18px; } .chat-typing-dot { display: inline-block; animation: chat-dot-flash 1.8s ease-in-out infinite; } .chat-typing-dot:nth-child(2) { animation-delay: .3s; } .chat-typing-dot:nth-child(3) { animation-delay: .6s; }';
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  const updateConversation = (id: string, change: (conversation: Conversation) => Conversation) => {
    setConversations(current => current.map(item => item.id === id ? change(item) : item).sort((a, b) => b.updatedAt - a.updatedAt));
  };

  const newChat = () => { if (busy) return; setActiveId(null); setInput(''); setError(''); setDraftPreset('words'); setShowHistory(false); };
  const selectChat = (id: string) => { if (busy) return; setActiveId(id); setInput(''); setError(''); setShowHistory(false); };
  const selectPreset = (next: ChatPreset) => {
    if (activeId) updateConversation(activeId, conversation => ({ ...conversation, preset: next }));
    else setDraftPreset(next);
  };
  const confirmRemoval = () => {
    if (!pendingRemoval) return;
    patch(current => removeVocabularyWord(current, pendingRemoval.hanzi));
    setPendingRemoval(null);
  };

  const send = async () => {
    const question = input.trim();
    if (!question || busy) return;
    const id = activeId ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const next: ChatMessage[] = [...messages, { role: 'user', text: question }];
    if (!activeId) {
      setActiveId(id);
      setConversations(current => [{ id, title: 'New chat', preset, messages: next, updatedAt: Date.now() }, ...current]);
    } else updateConversation(id, conversation => ({ ...conversation, messages: next, updatedAt: Date.now() }));
    setInput(''); setBusy(true); setError('');
    try {
      const history: ChatTurn[] = next.map(item => ({ role: item.role, content: item.text }));
      const reply = await requestChatReply(data.settings, preset, history, answer => {
        if (!answer) return;
        updateConversation(id, conversation => {
          const last = conversation.messages.at(-1);
          const streamed: ChatMessage = { role: 'assistant', text: answer, reply: { answer, words: [] } };
          return { ...conversation, messages: last?.role === 'assistant' ? [...conversation.messages.slice(0, -1), streamed] : [...conversation.messages, streamed] };
        });
      });
      updateConversation(id, conversation => {
        const last = conversation.messages.at(-1);
        const completed: ChatMessage = { role: 'assistant', text: reply.answer, reply };
        return { ...conversation, title: conversation.title === 'New chat' ? chatTitleForQuestion(reply.title, question) : conversation.title,
          messages: last?.role === 'assistant' ? [...conversation.messages.slice(0, -1), completed] : [...conversation.messages, completed], updatedAt: Date.now() };
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chat request failed.');
    }
    finally { setBusy(false); }
  };

  if (!data.settings.aiChatEnabled) return null;

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Open DeepSeek chat" onPointerDown={Platform.OS === 'web' ? (event: NativePointerEvent) => startLauncherDrag(event.nativeEvent.pageX, event.nativeEvent.pageY) : undefined} onTouchStart={Platform.OS === 'web' ? undefined : (event: GestureResponderEvent) => startLauncherDrag(event.nativeEvent.pageX, event.nativeEvent.pageY)} onPressOut={() => setLauncherPressed(false)} onTouchMove={Platform.OS === 'web' ? undefined : event => moveLauncherTo(event.nativeEvent.pageX, event.nativeEvent.pageY, width, height, insets.top, insets.bottom)} onTouchEnd={Platform.OS === 'web' ? undefined : finishLauncherDrag} onTouchCancel={Platform.OS === 'web' ? undefined : finishLauncherDrag} onPress={() => { if (suppressLauncherPress.current) return; if (missingApiKey) { showMissingApiKeyPrompt(); return; } setOpen(true); }} style={[styles.launcher, launcherPosition ? { left: launcherPosition.x, top: launcherPosition.y } : { right: 15, top: insets.top + 14 }, { touchAction: 'none' } as ViewStyle, missingApiKey && styles.launcherMissingKey, !missingApiKey && launcherPressed && styles.launcherOpaque]}>
      <View style={[styles.launcherRing, missingApiKey && styles.launcherRingMissingKey]}><Ionicons name="hardware-chip-outline" size={25} color={missingApiKey ? '#69726E' : '#D9FFF4'} /></View>
      <View style={[styles.orbitDot, missingApiKey && styles.orbitDotMissingKey]} />
    </Pressable>
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.page, { paddingTop: insets.top }, Platform.OS === 'web' && webViewport && { position: 'absolute', left: 0, right: 0, top: webViewport.top, height: webViewport.height, flex: 0 }]}>
        <View style={styles.header}>
          <View style={styles.headerTitle}><Text style={styles.eyebrow}>DEEPSEEK</Text><Text numberOfLines={1} style={styles.title}>{showHistory ? 'Previous chats' : active?.title ?? 'New chat'}</Text></View>
          <View style={styles.headerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="New chat" accessibilityState={{ disabled: busy }} disabled={busy} onPress={newChat} style={styles.headerButton}><Ionicons name="add" size={24} color={colors.green} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={showHistory ? 'Back to chat' : 'Previous chats'} onPress={() => setShowHistory(value => !value)} style={styles.headerButton}><Ionicons name={showHistory ? 'chatbubble-outline' : 'time-outline'} size={22} color={colors.green} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Close chat" onPress={() => setOpen(false)} style={styles.close}><Ionicons name="close" size={25} color={colors.ink} /></Pressable>
          </View>
        </View>
        {showHistory ? <ScrollView style={styles.history} contentContainerStyle={styles.historyList}>
          {!conversations.length && <Text style={styles.empty}>No previous chats yet.</Text>}
          {conversations.map(conversation => <Pressable key={conversation.id} accessibilityRole="button" accessibilityLabel={`Open ${conversation.title}`} accessibilityState={{ disabled: busy, selected: conversation.id === activeId }} disabled={busy} onPress={() => selectChat(conversation.id)} style={[styles.historyItem, conversation.id === activeId && styles.historyItemActive]}>
            <Text numberOfLines={1} style={styles.historyItemTitle}>{conversation.title}</Text>
            <Text numberOfLines={1} style={styles.historyItemPreview}>{conversation.messages.find(item => item.role === 'user')?.text ?? ''}</Text>
          </Pressable>)}
        </ScrollView> : <>
        <View style={styles.historyFrame}>
        <ScrollView ref={scroll} style={styles.history} contentContainerStyle={[styles.historyContent, busy && styles.historyContentWhileTyping]} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          {!messages.length && <Text style={styles.empty}>Ask about Chinese words, a Hanzi, or a message you want to answer.</Text>}
          {visibleMessages.map((item, index) => {
            const question = visibleMessages.slice(0, index).reverse().find(message => message.role === 'user')?.text ?? '';
            const addable = item.role === 'assistant' ? new Set(addableChatWords(item.reply.words, question).map(word => word.hanzi)) : new Set<string>();
            return <View key={index} style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
            {!!item.text && <Text style={[styles.messageText, item.role === 'user' && styles.userText]}>{item.text}</Text>}
            {item.role === 'assistant' && !!item.reply.words.length && <View style={styles.wordsSection}>
              <Text style={styles.wordsTitle}>BREAKDOWN · TAP GREEN TO ADD</Text>
              {item.reply.words.map(word => {
                const added = saved.has(word.hanzi);
                const wordContent = <>
                  <Text style={[styles.hanzi, added && styles.wordTextAdded, !addable.has(word.hanzi) && styles.wordReadOnlyText]}>{word.hanzi}</Text>
                  <View style={styles.wordDetail}><Text style={[styles.pinyin, added && styles.wordTextAdded, !addable.has(word.hanzi) && styles.wordReadOnlyText]}>{word.pinyin}</Text><Text style={[styles.translation, added && styles.wordTextAdded, !addable.has(word.hanzi) && styles.wordReadOnlyText]}>{word.translation}</Text></View>
                </>;
                if (!addable.has(word.hanzi)) return <View key={word.hanzi} style={[styles.wordRow, styles.wordReadOnly]}>{wordContent}</View>;
                return <Pressable key={word.hanzi} accessibilityRole="button" accessibilityLabel={`${added ? 'Remove' : 'Add'} ${word.hanzi} ${added ? 'from' : 'to'} vocabulary`} accessibilityState={{ selected: added }} onPress={() => { if (added) setPendingRemoval(word); else importWords([dictionary?.get(word.hanzi) ?? { hanzi: word.hanzi, pinyin: word.pinyin, russian: word.translation }]); }} style={[styles.wordRow, added && styles.wordAdded]}>
                  {wordContent}
                  <Ionicons name={added ? 'checkmark' : 'add'} size={16} color={added ? colors.green : colors.white} />
                </Pressable>;
              })}
            </View>}
          </View>;})}
          {!!error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
        {busy && <View accessibilityLabel="DeepSeek is thinking" style={styles.typingIndicator}>{Platform.OS === 'web' ? <span className="chat-typing">thinking<span className="chat-typing-dot">.</span><span className="chat-typing-dot">.</span><span className="chat-typing-dot">.</span></span> : <Text style={styles.typingText}>Thinking…</Text>}</View>}
        </View>
        <View style={styles.promptArea}>
          <Text style={styles.promptLabel}>CHOOSE A PROMPT</Text>
          <View style={styles.promptButtons}>{CHAT_PRESETS.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === preset }} onPress={() => selectPreset(item.id)} style={[styles.promptButton, item.id === preset && styles.promptSelected]}><Text style={[styles.promptText, item.id === preset && styles.promptTextSelected]}>{item.label}</Text></Pressable>)}</View>
        </View>
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput accessibilityLabel="Chat message" multiline value={input} onChangeText={setInput} placeholder="Type a message…" placeholderTextColor={colors.muted} style={styles.input} />
          <Pressable accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: !input.trim() || busy }} disabled={!input.trim() || busy} onPress={() => void send()} style={[styles.send, (!input.trim() || busy) && styles.sendDisabled]}><Ionicons name="arrow-up" size={23} color={colors.white} /></Pressable>
        </View>
        </>}
        {pendingRemoval && <View style={styles.confirmOverlay} accessibilityViewIsModal>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel removing word" onPress={() => setPendingRemoval(null)} style={StyleSheet.absoluteFillObject} />
          <View style={styles.confirmDialog}>
            <Text style={styles.confirmTitle}>Remove {pendingRemoval.hanzi}?</Text>
            <Text style={styles.confirmMessage}>Do you really want to remove this word from your vocabulary?</Text>
            <View style={styles.confirmActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => setPendingRemoval(null)} style={styles.confirmAction}><Text style={styles.confirmCancel}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${pendingRemoval.hanzi} from vocabulary`} onPress={confirmRemoval} style={styles.confirmAction}><Text style={styles.confirmRemove}>Remove</Text></Pressable>
            </View>
          </View>
        </View>}
      </KeyboardAvoidingView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  launcher: { position: 'absolute', right: 15, zIndex: 20, width: 51, height: 51, borderRadius: 26, opacity: 0.85, backgroundColor: 'rgba(16, 73, 72, 0.72)', borderWidth: 1, borderColor: 'rgba(157, 255, 226, 0.65)', alignItems: 'center', justifyContent: 'center', shadowColor: '#25E6BD', shadowOpacity: 0.35, shadowRadius: 10, elevation: 8 },
  launcherOpaque: { opacity: 1, backgroundColor: '#104948' },
  launcherMissingKey: { opacity: 1, backgroundColor: '#D6DAD7', borderColor: '#AAB3AE', shadowOpacity: 0, elevation: 2 },
  launcherRing: { width: 38, height: 38, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(206, 255, 242, 0.45)', alignItems: 'center', justifyContent: 'center' },
  launcherRingMissingKey: { borderColor: '#AAB3AE' },
  orbitDot: { position: 'absolute', right: 4, top: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: '#9FFFE0' },
  orbitDotMissingKey: { backgroundColor: '#929E97' },
  page: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 70, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  headerTitle: { flex: 1, minWidth: 0, marginRight: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.pale },
  eyebrow: { fontSize: 10, letterSpacing: 2.2, fontWeight: '800', color: colors.green },
  title: { fontSize: 25, fontWeight: '800', color: colors.ink },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pale },
  promptArea: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  promptLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.3, color: colors.muted, marginBottom: 5 },
  promptButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  promptButton: { borderRadius: 9, borderWidth: 1, borderColor: '#8AAE99', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#E4F2E7' },
  promptSelected: { backgroundColor: colors.green, borderColor: colors.green },
  promptText: { fontSize: 13, fontWeight: '700', color: colors.green },
  promptTextSelected: { color: colors.white },
  history: { flex: 1 },
  historyFrame: { flex: 1, position: 'relative' },
  historyContent: { padding: 16, paddingBottom: 28, gap: 15 },
  historyContentWhileTyping: { paddingBottom: 55 },
  historyList: { padding: 16, gap: 9 },
  historyItem: { padding: 14, borderRadius: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, gap: 4 },
  historyItemActive: { borderColor: colors.green },
  historyItemTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  historyItemPreview: { color: colors.muted, fontSize: 13 },
  empty: { color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 48, paddingHorizontal: 20 },
  bubble: { maxWidth: '94%', padding: 15, borderRadius: 17 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.green, borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 4, width: '94%' },
  messageText: { fontSize: 18, lineHeight: 28, color: colors.ink },
  userText: { color: colors.white },
  wordsSection: { marginTop: 13, borderTopWidth: 1, borderColor: colors.line, paddingTop: 12, gap: 7 },
  wordsTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, color: colors.muted, marginBottom: 2 },
  wordRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 11, backgroundColor: colors.green, borderWidth: 1, borderColor: '#236E52' },
  wordReadOnly: { backgroundColor: colors.paper, borderColor: colors.line },
  wordReadOnlyText: { color: colors.ink },
  wordAdded: { backgroundColor: '#D8EBDD', borderColor: '#A9CBB4' },
  wordTextAdded: { color: colors.green },
  hanzi: { fontSize: 24, fontWeight: '800', color: colors.white, minWidth: 44 },
  wordDetail: { flex: 1 },
  pinyin: { fontSize: 16, fontWeight: '700', color: colors.white },
  translation: { fontSize: 16, color: colors.white },
  typingIndicator: { position: 'absolute', left: 16, bottom: 7, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.paper },
  typingText: { color: colors.green, fontSize: 16, fontStyle: 'italic' },
  error: { color: colors.red, fontSize: 14, lineHeight: 21 },
  composer: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  input: { flex: 1, maxHeight: 120, minHeight: 44, borderWidth: 1, borderColor: '#C5D8CD', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, color: colors.ink, fontSize: 16, backgroundColor: colors.paper },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green },
  sendDisabled: { opacity: 0.4 },
  confirmOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 30, backgroundColor: 'rgba(0, 0, 0, 0.32)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  confirmDialog: { width: '100%', maxWidth: 300, borderRadius: 14, backgroundColor: '#F8F8F8', overflow: 'hidden', alignItems: 'center', paddingTop: 22 },
  confirmTitle: { color: '#111', fontSize: 17, fontWeight: '700', textAlign: 'center', paddingHorizontal: 18 },
  confirmMessage: { color: '#333', fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: 20, marginTop: 6, marginBottom: 20 },
  confirmActions: { alignSelf: 'stretch', flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#D3D3D6' },
  confirmAction: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#D3D3D6' },
  confirmCancel: { color: '#007AFF', fontSize: 17 },
  confirmRemove: { color: '#FF3B30', fontSize: 17, fontWeight: '600' },
});
