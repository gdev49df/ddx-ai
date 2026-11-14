import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, R } from './theme';

export function Btn({ label, onPress, kind = 'solid', disabled, busy, small }: { label: string; onPress: () => void; kind?: 'solid' | 'ghost' | 'danger'; disabled?: boolean; busy?: boolean; small?: boolean }) {
  const solid = kind === 'solid';
  return (
    <Pressable disabled={disabled || busy} onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [s.btn, small && { paddingVertical: 9, paddingHorizontal: 14 }, solid ? { backgroundColor: C.ink } : { backgroundColor: C.white06, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line }, (disabled || busy) && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.97 }] }]}>
      {busy ? <ActivityIndicator color={solid ? C.bg : C.ink} /> : <Text style={[s.btnT, { color: solid ? C.bg : kind === 'danger' ? C.danger : C.ink }]}>{label}</Text>}
    </Pressable>
  );
}

export function Sheet({ visible, title, onClose, children, full }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; full?: boolean }) {
  const ins = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} />
      <View style={[s.sheet, full && { height: '92%' }, { paddingBottom: ins.bottom + 8 }]}>
        <View style={s.grab} />
        <View style={s.sheetHead}>
          <Text style={s.sheetTitle}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}><Text style={s.close}>✕</Text></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 14 }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

export function Field(p: React.ComponentProps<typeof TextInput> & { label?: string }) {
  const { label, style, ...rest } = p;
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={C.mute} selectionColor={C.ink} keyboardAppearance="dark" {...rest} style={[s.input, style]} />
    </View>
  );
}

export function Seg<T extends string>({ value, opts, onChange }: { value: T; opts: [T, string][]; onChange: (v: T) => void }) {
  return (
    <View style={s.seg}>
      {opts.map(([k, l]) => (
        <Pressable key={k} onPress={() => { Haptics.selectionAsync(); onChange(k); }} style={[s.segB, value === k && { backgroundColor: C.ink }]}>
          <Text style={[s.segT, value === k && { color: C.bg }]}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Row({ title, sub, right, onPress }: { title: string; sub?: string; right?: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.white06 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowT}>{title}</Text>
        {sub ? <Text style={s.rowS}>{sub}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export const Card = ({ children }: { children: React.ReactNode }) => <View style={s.card}>{children}</View>;
export const Label = ({ t }: { t: string }) => <Text style={s.label}>{t}</Text>;

const s = StyleSheet.create({
  btn: { borderRadius: R.pill, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  btnT: { fontSize: 15, fontWeight: '700' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: C.bg2, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  grab: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: C.white10, marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14 },
  sheetTitle: { color: C.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  close: { color: C.mute, fontSize: 18, padding: 4 },
  label: { color: C.mute, fontSize: 13, fontWeight: '600', marginLeft: 4 },
  input: { color: C.ink, backgroundColor: C.card, borderRadius: R.md, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16 },
  seg: { flexDirection: 'row', backgroundColor: C.white06, borderRadius: R.pill, padding: 3, flexWrap: 'wrap' },
  segB: { flexGrow: 1, paddingVertical: 9, paddingHorizontal: 10, borderRadius: R.pill, alignItems: 'center' },
  segT: { color: C.soft, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14, borderRadius: R.md },
  rowT: { color: C.ink, fontSize: 16, fontWeight: '600' },
  rowS: { color: C.mute, fontSize: 13, marginTop: 2 },
  card: { backgroundColor: C.card, borderRadius: R.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, padding: 6 },
});
