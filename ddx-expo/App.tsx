import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChatScreen } from './src/ChatScreen';
import { AuthSheet, ChatsSheet, PlansSheet, SettingsSheet } from './src/Sheets';
import { init, syncDown, useStore } from './src/store';
import { C } from './src/theme';

export default function App() {
  const s = useStore();
  const [chats, setChats] = useState(false), [sets, setSets] = useState(false), [auth, setAuth] = useState(false), [plans, setPlans] = useState(false);
  useEffect(() => { init(); }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (x) => { if (x === 'active') syncDown(true); });
    return () => sub.remove();
  }, []);
  if (!s.ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ChatScreen openChats={() => setChats(true)} openSettings={() => setSets(true)} openPlans={() => setPlans(true)} />
        {s.toast ? <View style={st.toast} pointerEvents="none"><Text style={st.toastT}>{s.toast}</Text></View> : null}
      </View>
      <ChatsSheet visible={chats} onClose={() => setChats(false)} />
      <SettingsSheet visible={sets} onClose={() => setSets(false)} openAuth={() => setAuth(true)} openPlans={() => setPlans(true)} />
      <AuthSheet visible={auth} onClose={() => setAuth(false)} />
      <PlansSheet visible={plans} onClose={() => setPlans(false)} />
    </SafeAreaProvider>
  );
}
const st = StyleSheet.create({
  toast: { position: 'absolute', top: 100, alignSelf: 'center', backgroundColor: C.card2, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  toastT: { color: C.ink, fontSize: 14 },
});
