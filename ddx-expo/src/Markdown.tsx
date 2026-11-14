import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import React, { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, R } from './theme';

type Tok = { t: 'text' | 'b' | 'i' | 'code' | 'a'; v: string; u?: string };

function inline(s: string): Tok[] {
  const out: Tok[] = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))|(https?:\/\/[^\s)<]+)/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    const x = m[0];
    if (m[1]) out.push({ t: 'code', v: x.slice(1, -1) });
    else if (m[2]) out.push({ t: 'b', v: x.slice(2, -2) });
    else if (m[3]) out.push({ t: 'i', v: x.slice(1, -1) });
    else if (m[4]) { const k = x.indexOf(']('); out.push({ t: 'a', v: x.slice(1, k), u: x.slice(k + 2, -1) }); }
    else out.push({ t: 'a', v: x, u: x });
    last = m.index + x.length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}

function Inline({ s, style }: { s: string; style?: any }) {
  return (
    <Text style={[st.p, style]}>
      {inline(s).map((k, i) =>
        k.t === 'b' ? <Text key={i} style={st.b}>{k.v}</Text>
        : k.t === 'i' ? <Text key={i} style={st.i}>{k.v}</Text>
        : k.t === 'code' ? <Text key={i} style={st.ic}>{' ' + k.v + ' '}</Text>
        : k.t === 'a' ? <Text key={i} style={st.a} onPress={() => Linking.openURL(k.u!).catch(() => {})}>{k.v}</Text>
        : <Text key={i}>{k.v}</Text>)}
    </Text>
  );
}

function Code({ lang, code }: { lang: string; code: string }) {
  const [ok, setOk] = useState(false);
  return (
    <View style={st.codeBox}>
      <View style={st.codeHead}>
        <Text style={st.codeLang}>{lang || 'код'}</Text>
        <Pressable hitSlop={10} onPress={() => { Clipboard.setStringAsync(code); Haptics.selectionAsync(); setOk(true); setTimeout(() => setOk(false), 1400); }}>
          <Text style={st.codeCopy}>{ok ? 'скопировано' : 'копировать'}</Text>
        </Pressable>
      </View>
      <Text selectable style={st.code}>{code}</Text>
    </View>
  );
}

function Md({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0, key = 0, para: string[] = [];
  const flush = () => { if (para.length) { nodes.push(<Inline key={key++} s={para.join('\n')} />); para = []; } };
  while (i < lines.length) {
    const l = lines[i];
    const fence = l.match(/^\s*```(\w*)/);
    if (fence) {
      flush(); const buf: string[] = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++; nodes.push(<Code key={key++} lang={fence[1]} code={buf.join('\n')} />); continue;
    }
    const hd = l.match(/^(#{1,4})\s+(.*)$/);
    if (hd) { flush(); nodes.push(<Inline key={key++} s={hd[2]} style={[st.h, hd[1].length === 1 && { fontSize: 22 }, hd[1].length === 2 && { fontSize: 19 }]} />); i++; continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(l)) { flush(); nodes.push(<View key={key++} style={st.hr} />); i++; continue; }
    const li = l.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/);
    if (li) {
      flush(); const bullet = /\d/.test(li[2]) ? li[2] : '•'; const depth = Math.min(2, Math.floor(li[1].length / 2));
      nodes.push(<View key={key++} style={[st.li, { paddingLeft: depth * 16 }]}><Text style={st.bul}>{bullet}</Text><View style={{ flex: 1 }}><Inline s={li[3]} /></View></View>); i++; continue;
    }
    const q = l.match(/^>\s?(.*)$/);
    if (q) { flush(); const buf = [q[1]]; i++; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); nodes.push(<View key={key++} style={st.quote}><Inline s={buf.join('\n')} style={{ color: C.soft }} /></View>); continue; }
    if (!l.trim()) { flush(); i++; continue; }
    para.push(l); i++;
  }
  flush();
  return <View style={{ gap: 8 }}>{nodes}</View>;
}
export const Markdown = memo(Md);

const mono = { fontFamily: 'Menlo' } as const;
const st = StyleSheet.create({
  p: { color: C.ink, fontSize: 16, lineHeight: 24 },
  b: { fontWeight: '700' },
  i: { fontStyle: 'italic' },
  ic: { ...mono, backgroundColor: C.white10, fontSize: 14, color: C.ink },
  a: { color: C.ink, textDecorationLine: 'underline', textDecorationColor: C.mute },
  h: { fontWeight: '800', fontSize: 17, letterSpacing: -0.3, marginTop: 4 },
  li: { flexDirection: 'row', gap: 8 },
  bul: { color: C.mute, fontSize: 16, lineHeight: 24, minWidth: 14 },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: 6 },
  quote: { borderLeftWidth: 3, borderLeftColor: C.white10, paddingLeft: 12 },
  codeBox: { backgroundColor: '#0c0c0f', borderRadius: R.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, overflow: 'hidden' },
  codeHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.white06 },
  codeLang: { color: C.mute, fontSize: 12, fontWeight: '600' },
  codeCopy: { color: C.soft, fontSize: 12, fontWeight: '600' },
  code: { ...mono, color: C.soft, fontSize: 13, lineHeight: 19, padding: 12 },
});
