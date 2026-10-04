import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StoreProvider } from '@/context';
import { colors } from '@/theme';
import { useStore } from '@/context';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Welcome from './welcome';
import { I18nProvider, translate } from '@/i18n';
import { useEffect } from 'react';

function WebShellStyles() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    viewport?.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
    if (document.getElementById('hanzi-app-shell')) return;
    const style = document.createElement('style');
    style.id = 'hanzi-app-shell';
    style.textContent = 'html,body,#root{width:100%;max-width:100%;height:100%;overflow:hidden;overscroll-behavior:none}body{margin:0;background:#F7F5EE;touch-action:pan-x pan-y;-webkit-tap-highlight-color:transparent}';
    document.head.appendChild(style);
  }, []);
  return null;
}

function AppTabs() {
  const { data, ready } = useStore();
  const insets = useSafeAreaInsets();
  if (!ready) return <View style={styles.loading}><ActivityIndicator color={colors.green} /></View>;
  if (!data.languageSelected || !data.onboardingComplete) return <I18nProvider value={data.settings.language}><Welcome /></I18nProvider>;
  const t = (value: string) => translate(data.settings.language, value);
  return <I18nProvider value={data.settings.language}><StatusBar style="dark"/><Tabs screenOptions={({ route }) => ({ headerShown: false, sceneStyle: { backgroundColor: colors.paper, paddingTop: insets.top }, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: '#8B8E86', tabBarStyle: { height: 70 + insets.bottom, paddingTop: 7, paddingBottom: 9 + insets.bottom, backgroundColor: colors.card, borderTopColor: colors.line }, tabBarLabelStyle: { fontSize: 11, fontWeight: '700' }, tabBarIcon: ({ color, size }) => <Ionicons name={({ index: 'home-outline', settings: 'settings-outline' } as const)[route.name] ?? 'ellipse-outline'} color={color} size={size} /> })}><Tabs.Screen name="index" options={{ title: t('Home') }}/><Tabs.Screen name="welcome" options={{ href: null }}/><Tabs.Screen name="import" options={{ href: null }}/><Tabs.Screen name="cards" options={{ href: null }}/><Tabs.Screen name="practice" options={{ href: null }}/><Tabs.Screen name="listening" options={{ href: null }}/><Tabs.Screen name="mix" options={{ href: null }}/><Tabs.Screen name="settings" options={{ title: t('Settings') }}/><Tabs.Screen name="auth/callback" options={{ href: null }}/><Tabs.Screen name="writing-experiment" options={{ href: null }}/><Tabs.Screen name="explanation" options={{ href: null }}/></Tabs></I18nProvider>;
}

export default function Layout() { return <SafeAreaProvider><StoreProvider><WebShellStyles/><AppTabs/></StoreProvider></SafeAreaProvider>; }

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper } });
