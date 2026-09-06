import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StoreProvider } from '@/context';
import { colors } from '@/theme';
import { useStore } from '@/context';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Welcome from './welcome';

function AppTabs() {
  const { data, ready } = useStore();
  if (!ready) return <View style={styles.loading}><ActivityIndicator color={colors.green} /></View>;
  if (!data.onboardingComplete) return <Welcome />;
  const showSentences =
    data.settings.apiKeyValidated && data.settings.showSentencesTab;
  return <><StatusBar style="dark"/><Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: '#8B8E86', tabBarStyle: { height: 70, paddingTop: 7, paddingBottom: 9, backgroundColor: colors.card, borderTopColor: colors.line }, tabBarLabelStyle: { fontSize: 11, fontWeight: '700' }, tabBarIcon: ({ color, size }) => <Ionicons name={({ index: 'home-outline', cards: 'albums-outline', practice: 'create-outline', listening: 'headset-outline', mix: 'shuffle-outline', settings: 'settings-outline' } as const)[route.name] ?? 'ellipse-outline'} color={color} size={size} /> })}><Tabs.Screen name="index" options={{ title: 'Home' }}/><Tabs.Screen name="welcome" options={{ href: null }}/><Tabs.Screen name="import" options={{ href: null }}/><Tabs.Screen name="cards" options={{ title: 'Cards' }}/><Tabs.Screen name="practice" options={{ title: 'Sentences', href: showSentences ? '/practice' : null }}/><Tabs.Screen name="listening" options={{ title: 'Listening', href: data.settings.showListeningTab ? '/listening' : null }}/><Tabs.Screen name="mix" options={{ title: 'Mix', href: data.settings.showMixTab ? '/mix' : null }}/><Tabs.Screen name="settings" options={{ title: 'Settings' }}/><Tabs.Screen name="writing-experiment" options={{ href: null }}/><Tabs.Screen name="qr-export" options={{ href: null }}/></Tabs></>;
}

export default function Layout() { return <StoreProvider><AppTabs/></StoreProvider>; }

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper } });
