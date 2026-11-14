import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Markdown } from './Markdown';
import { curChat, hm, newChat, regenerate, send, setFeedback, stop, useStore } from './store';
import { C, R } from './theme';
import type { Msg } from './types';

const HINTS = ['объясни, как работает инфляция', 'идея подарка до 10 000 ₸', 'план тренировок на неделю', 'помоги написать письмо'];

function Dots() {
  const a = useRef([0, 1, 2].map(() => new Animated.Value(0.25))).current;
  useEffect(() => {
    const loops = a.map((v, i) => Animated.loop(Animated.sequence([Animated.delay(i * 160), Animated.timing(v, { toValue: 1, duration: 420, useNativeDriver: true }), Animated.timing(v, { toValue: 0.25, duration: 420, useNativeDriver: true }), Animated.delay(480 - i * 160)])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [a]);
  return <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 14 }}>{a.map((v, i) => <Animated.View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.ink, opacity: v }} />)}</View>;
}

function Appear({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(v, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180 }).start(); }, [v]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>{children}</Animated.View>;
}

function Bubble({ m, last, chatId }: { m: Msg; last: boolean; chatId: string }) {
  const s = useStore();
  const [ok, setOk] = useState(false);
  if (m.role === 'user') {
    return (
      <Appear>
        <View style={st.userRow}>
          <View style={st.user}><Text selectable style={st.userT}>{m.text}</Text></View>
        </View>
      </Appear>
    );
  }
  return (
    <Appear>
      <View style={{ gap: 10 }}>
        <Markdown text={m.text} />
        {m.src && m.src.length ? (
          <View style={st.srcs}>
            {m.src.map((x, i) => <Pressable key={i} style={st.src} onPress={() => Linking.openURL(x.u).catch(() => {})}><Text style={st.srcT} numberOfLines={1}>{i + 1} · {x.t}</Text></Pressable>)}
          </View>
        ) : null}
        <View style={st.acts}>
          <Pressable hitSlop={8} style={st.act} onPress={() => { Clipboard.setStringAsync(m.text); Haptics.selectionAsync(); setOk(true); setTimeout(() => setOk(false), 1400); }}><Text style={st.actT}>{ok ? 'скопировано' : 'копировать'}</Text></Pressable>
          {last && !s.busy ? <Pressable hitSlop={8} style={st.act} onPress={() => { Haptics.selectionAsync(); regenerate(); }}><Text style={st.actT}>ещё раз</Text></Pressable> : null}
          <Pressable hitSlop={8} style={st.act} onPress={() => { Haptics.selectionAsync(); setFeedback(chatId, m.at, 'up'); }}><Text style={[st.actT, m.fb === 'up' && { color: C.ok }]}>👍</Text></Pressable>
          <Pressable hitSlop={8} style={st.act} onPress={() => { Haptics.selectionAsync(); setFeedback(chatId, m.at, 'down'); }}><Text style={[st.actT, m.fb === 'down' && { color: C.danger }]}>👎</Text></Pressable>
        </View>
        {last && !s.busy && m.next && m.next.length ? (
          <View style={{ gap: 8, marginTop: 4 }}>
            {m.next.map((q) => <Pressable key={q} style={st.next} onPress={() => { Haptics.selectionAsync(); send(q); }}><Text style={st.nextT}>{q}</Text></Pressable>)}
          </View>
        ) : null}
      </View>
    </Appear>
  );
}

export function ChatScreen({ openChats, openSettings, openPlans }: { openChats: () => void; openSettings: () => void; openPlans: () => void }) {
  const s = useStore();
  const ins = useSafeAreaInsets();
  const c = curChat(s);
  const [text, setText] = useState('');
  const list = useRef<FlatList<Msg>>(null);
  const msgs = c ? c.msgs : [];
  const toEnd = useCallback((anim = true) => setTimeout(() => list.current?.scrollToEnd({ animated: anim }), 60), []);
  useEffect(() => { toEnd(); }, [msgs.length, s.thinking, s.error, toEnd]);

  const doSend = () => { const t = text.trim(); if (!t) return; setText(''); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); send(t); };
  const left = s.left;
  const warn = !!left && left.left <= 0;

  const header = (
    <View style={[st.bar, { paddingTop: ins.top + 6 }]}>
      <Pressable hitSlop={10} onPress={openChats} style={st.ib}><Text style={st.ibT}>☰</Text></Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={st.title} numberOfLines={1}>{c && c.msgs.length ? c.title : 'DDX AI'}</Text>
        {left ? <Pressable onPress={openPlans}><Text style={[st.left, warn && { color: C.danger }]}>{(s.sub ? s.sub.plan + ': ' : '') + 'осталось ' + left.left + (left.limit ? ' из ' + left.limit : '') + (left.left <= 0 && left.reset ? ' · в ' + hm(left.reset) : '')}</Text></Pressable> : null}
      </View>
      <Pressable hitSlop={10} onPress={() => { Haptics.selectionAsync(); newChat(); }} style={st.ib}><Text style={st.ibT}>＋</Text></Pressable>
      <Pressable hitSlop={10} onPress={openSettings} style={st.ib}><Text style={st.ibT}>⚙</Text></Pressable>
    </View>
  );

  const empty = (
    <View style={st.empty}>
      <View style={st.logo}><Text style={{ color: C.ink, fontSize: 30, fontWeight: '900' }}>D</Text></View>
      <Text style={st.hello}>{s.settings.name ? 'привет, ' + s.settings.name : 'привет'}</Text>
      <Text style={st.sub}>спроси что угодно</Text>
      <View style={{ gap: 8, alignSelf: 'stretch', marginTop: 22 }}>
        {HINTS.map((h) => <Pressable key={h} style={st.next} onPress={() => { Haptics.selectionAsync(); send(h); }}><Text style={st.nextT}>{h}</Text></Pressable>)}
      </View>
    </View>
  );

  return (
    <View style={st.root}>
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={list}
          data={msgs}
          keyExtractor={(m, i) => m.id || String(m.at) + i}
          renderItem={({ item, index }) => <Bubble m={item} last={index === msgs.length - 1 && item.role === 'assistant'} chatId={c!.id} />}
          contentContainerStyle={st.listC}
          ItemSeparatorComponent={() => <View style={{ height: 22 }} />}
          ListEmptyComponent={empty}
          ListFooterComponent={
            <View style={{ gap: 12, marginTop: 8 }}>
              {s.thinking ? <Dots /> : null}
              {s.error ? (
                <View style={st.err}>
                  <Text style={st.errT}>{s.error}</Text>
                  <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
                    {s.plansHint ? <Pressable onPress={openPlans}><Text style={st.errB}>тарифы</Text></Pressable> : <Pressable onPress={() => regenerate()}><Text style={st.errB}>повторить</Text></Pressable>}
                  </View>
                </View>
              ) : null}
            </View>
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => { if (s.busy) list.current?.scrollToEnd({ animated: false }); }}
        />
        <View style={[st.comp, { paddingBottom: Math.max(ins.bottom, 10) }]}>
          <View style={st.box}>
            <TextInput
              value={text} onChangeText={setText} multiline placeholder="сообщение" placeholderTextColor={C.mute}
              style={st.input} maxLength={4000} keyboardAppearance="dark" selectionColor={C.ink} onFocus={() => toEnd()}
            />
            {s.busy ? (
              <Pressable onPress={() => { Haptics.selectionAsync(); stop(); }} style={st.send}><View style={{ width: 13, height: 13, borderRadius: 3, backgroundColor: C.bg }} /></Pressable>
            ) : (
              <Pressable onPress={doSend} disabled={!text.trim()} style={[st.send, !text.trim() && { opacity: 0.3 }]}><Text style={{ color: C.bg, fontSize: 20, fontWeight: '900', marginTop: -2 }}>↑</Text></Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, backgroundColor: C.bg },
  ib: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  ibT: { color: C.ink, fontSize: 20 },
  title: { color: C.ink, fontSize: 16, fontWeight: '700', letterSpacing: -0.2, maxWidth: 200 },
  left: { color: C.mute, fontSize: 11.5, marginTop: 1 },
  listC: { padding: 18, paddingBottom: 10, flexGrow: 1 },
  userRow: { alignItems: 'flex-end' },
  user: { backgroundColor: C.card2, borderRadius: 22, borderBottomRightRadius: 8, paddingHorizontal: 16, paddingVertical: 11, maxWidth: '86%', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  userT: { color: C.ink, fontSize: 16, lineHeight: 23 },
  acts: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  act: { paddingVertical: 2 },
  actT: { color: C.mute, fontSize: 13, fontWeight: '600' },
  srcs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  src: { backgroundColor: C.white06, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '100%', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  srcT: { color: C.soft, fontSize: 12.5 },
  next: { backgroundColor: C.card, borderRadius: R.md, paddingHorizontal: 16, paddingVertical: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  nextT: { color: C.soft, fontSize: 15 },
  err: { backgroundColor: 'rgba(255,107,107,0.08)', borderRadius: R.md, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,107,107,0.3)' },
  errT: { color: C.ink, fontSize: 14.5, lineHeight: 21 },
  errB: { color: C.ink, fontWeight: '700', textDecorationLine: 'underline' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  logo: { width: 68, height: 68, borderRadius: 20, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, marginBottom: 18 },
  hello: { color: C.ink, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  sub: { color: C.mute, fontSize: 16, marginTop: 4 },
  comp: { paddingHorizontal: 12, paddingTop: 6, backgroundColor: C.bg },
  box: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: C.card, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, color: C.ink, fontSize: 16.5, maxHeight: 140, paddingTop: Platform.OS === 'ios' ? 9 : 6, paddingBottom: Platform.OS === 'ios' ? 9 : 6 },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
});
