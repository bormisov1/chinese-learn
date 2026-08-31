import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StoreProvider } from '@/context';
import { colors } from '@/theme';

export default function Layout() { return <StoreProvider><StatusBar style="dark"/><Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: '#8B8E86', tabBarStyle: { height: 70, paddingTop: 7, paddingBottom: 9, backgroundColor: colors.card, borderTopColor: colors.line }, tabBarLabelStyle: { fontSize: 11, fontWeight: '700' }, tabBarIcon: ({ color, size }) => <Ionicons name={({ index: 'home-outline', import: 'scan-outline', cards: 'albums-outline', practice: 'create-outline', settings: 'settings-outline' } as const)[route.name] ?? 'ellipse-outline'} color={color} size={size} /> })}><Tabs.Screen name="index" options={{ title: 'Home' }}/><Tabs.Screen name="import" options={{ title: 'Import' }}/><Tabs.Screen name="cards" options={{ title: 'Cards' }}/><Tabs.Screen name="practice" options={{ title: 'Sentences' }}/><Tabs.Screen name="settings" options={{ title: 'Settings' }}/><Tabs.Screen name="writing-experiment" options={{ href: null }}/><Tabs.Screen name="qr-export" options={{ href: null }}/></Tabs></StoreProvider>; }
