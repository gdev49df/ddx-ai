import React, { useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { activateCode, addMemory, auth, clearAll, deleteChat, hm, logout, MODELS, newChat, openChat, pinChat, PERS, removeMemory, renameChat, setSetting, syncDown, useStore } from './store';
import { C } from './theme';
import { Btn, Card, Field, Label, Row, Seg, Sheet } from './ui';

/* ---------- список чатов ---------- */
export function ChatsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [ren, setRen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const list = [...s.chats].filter((c) => c.msgs.length || c.id === s.cur).filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()) || c.msgs.some((m) => m.text.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated - a.updated);
  return (
    <Sheet visible={visible} onClose={onClose} title="чаты" full>
      <Btn label="＋ новый чат" onPress={() => { newChat(); onClose(); }} />
      <Field value={q} onChangeText={setQ} placeholder="поиск по чатам" autoCorrect={false} />
      <Card>
        {list.length === 0 ? <Text style={{ color: C.mute, padding: 16 }}>чатов пока нет</Text> : null}
        {list.map((c) => (
          <View key={c.id}>
            {ren === c.id ? (
              <View style={{ padding: 10, gap: 8 }}>
                <Field value={name} onChangeText={setName} autoFocus maxLength={60} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Btn small label="сохранить" onPress={() => { renameChat(c.id, name); setRen(null); }} /></View>
                  <View style={{ flex: 1 }}><Btn small kind="ghost" label="отмена" onPress={() => setRen(null)} /></View>
                </View>
              </View>
            ) : (
              <Row
                title={(c.pinned ? '📌 ' : '') + c.title}
                sub={c.msgs.length ? c.msgs[c.msgs.length - 1].text.replace(/\s+/g, ' ').slice(0, 70) : 'пусто'}
                onPress={() => { openChat(c.id); onClose(); }}
                right={
                  <Pressable hitSlop={10} onPress={() => Alert.alert(c.title, undefined, [
                    { text: c.pinned ? 'открепить' : 'закрепить', onPress: () => pinChat(c.id) },
                    { text: 'переименовать', onPress: () => { setName(c.title); setRen(c.id); } },
                    { text: 'удалить', style: 'destructive', onPress: () => deleteChat(c.id) },
                    { text: 'отмена', style: 'cancel' },
                  ])}>
                    <Text style={{ color: C.mute, fontSize: 22, paddingHorizontal: 6 }}>⋯</Text>
                  </Pressable>
                }
              />
            )}
          </View>
        ))}
      </Card>
    </Sheet>
  );
}

/* ---------- вход / регистрация ---------- */
export function AuthSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [login, setLogin] = useState(''), [pass, setPass] = useState(''), [name, setName] = useState('');
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setErr(''); const e = await auth(mode, login, pass, name); setBusy(false); if (e) setErr(e); else { setPass(''); onClose(); } };
  return (
    <Sheet visible={visible} onClose={onClose} title={mode === 'in' ? 'вход' : 'регистрация'}>
      <Text style={{ color: C.mute, lineHeight: 21 }}>аккаунт тот же, что на сайте: чаты и тариф синхронизируются между телефоном и сайтом.</Text>
      <Seg value={mode} opts={[['in', 'вход'], ['up', 'регистрация']]} onChange={(m) => { setMode(m); setErr(''); }} />
      <Field label="логин" value={login} onChangeText={setLogin} autoCapitalize="none" autoCorrect={false} maxLength={24} placeholder="латиница, цифры" textContentType="username" />
      {mode === 'up' ? <Field label="имя" value={name} onChangeText={setName} maxLength={24} placeholder="как тебя зовут" /> : null}
      <Field label="пароль" value={pass} onChangeText={setPass} secureTextEntry maxLength={100} placeholder="от 6 символов" textContentType={mode === 'in' ? 'password' : 'newPassword'} onSubmitEditing={go} />
      {err ? <Text style={{ color: C.danger }}>{err}</Text> : null}
      <Btn label={mode === 'in' ? 'войти' : 'создать аккаунт'} onPress={go} busy={busy} />
    </Sheet>
  );
}

/* ---------- тарифы ---------- */
export function PlansSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useStore();
  const [code, setCode] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setErr(''); const e = await activateCode(code); setBusy(false); if (e) setErr(e); else setCode(''); };
  const plan = s.sub?.plan || 'free';
  return (
    <Sheet visible={visible} onClose={onClose} title="тарифы">
      <Card>
        <Row title={'сейчас: ' + plan} sub={s.left ? 'осталось ' + s.left.left + (s.left.limit ? ' из ' + s.left.limit : '') + ' сообщений' + (s.left.reset ? ' · ближайший слот в ' + hm(s.left.reset) : '') : 'лимит считается в окне 12 часов'} />
        {s.sub?.exp ? <Row title="действует до" sub={new Date(s.sub.exp).toLocaleDateString('ru-RU')} /> : null}
      </Card>
      <Card>
        <Row title="free" sub="12 сообщений за 12 часов" />
        <Row title="pro" sub="40 сообщений за 12 часов" />
        <Row title="max" sub="120 сообщений за 12 часов" />
        <Row title="ultra" sub="300 сообщений за 12 часов" />
      </Card>
      <Text style={{ color: C.mute, lineHeight: 21 }}>модель mistral тратит 2 сообщения, liama 1. купить тариф можно у @bauyrzhanov_12_ в telegram, потом введи код ниже.</Text>
      <Field label="код активации" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="XXXX-XXXX-XXXX" />
      {err ? <Text style={{ color: C.danger }}>{err}</Text> : null}
      <Btn label="активировать" onPress={go} busy={busy} disabled={!code.trim()} />
    </Sheet>
  );
}

/* ---------- настройки ---------- */
export function SettingsSheet({ visible, onClose, openAuth, openPlans }: { visible: boolean; onClose: () => void; openAuth: () => void; openPlans: () => void }) {
  const s = useStore();
  const st = s.settings;
  const [mem, setMem] = useState('');
  return (
    <Sheet visible={visible} onClose={onClose} title="настройки" full>
      <Label t="аккаунт" />
      <Card>
        {s.acct ? (
          <>
            <Row title={s.acct.user.name || s.acct.user.login} sub={'@' + s.acct.user.login + (s.syncAt ? ' · синхронизировано в ' + hm(s.syncAt) : '')} />
            <Row title="синхронизировать сейчас" onPress={() => syncDown(false)} />
            <Row title="выйти" onPress={() => Alert.alert('выйти из аккаунта?', 'чаты на этом телефоне останутся в облаке', [{ text: 'отмена', style: 'cancel' }, { text: 'выйти', style: 'destructive', onPress: logout }])} />
          </>
        ) : <Row title="войти или создать аккаунт" sub="чтобы чаты и тариф жили и на сайте" onPress={openAuth} />}
        <Row title={'тариф: ' + (s.sub?.plan || 'free')} sub={s.left ? 'осталось ' + s.left.left + (s.left.limit ? ' из ' + s.left.limit : '') : undefined} onPress={openPlans} right={<Text style={{ color: C.mute, fontSize: 20 }}>›</Text>} />
      </Card>

      <Label t="модель" />
      <Seg value={st.model || 'liama'} opts={MODELS.map((m) => [m.id, m.name] as [string, string])} onChange={(v) => setSetting({ model: v })} />
      <Text style={{ color: C.mute, marginLeft: 4 }}>{MODELS.find((m) => m.id === (st.model || 'liama'))?.note}</Text>
      <Card>
        <Row title="поиск в интернете" sub="актуальные факты и ссылки на источники" right={<Switch value={!!st.web} onValueChange={(v) => setSetting({ web: v })} trackColor={{ true: C.ok }} />} />
        <Row title="подсказки продолжения" right={<Switch value={st.sugg !== false} onValueChange={(v) => setSetting({ sugg: v })} trackColor={{ true: C.ok }} />} />
        <Row title="название чата автоматически" right={<Switch value={st.autoTitle !== false} onValueChange={(v) => setSetting({ autoTitle: v })} trackColor={{ true: C.ok }} />} />
      </Card>

      <Label t="о тебе" />
      <Field value={st.name || ''} onChangeText={(v) => setSetting({ name: v })} placeholder="как тебя зовут" maxLength={40} />
      <Field value={st.role || ''} onChangeText={(v) => setSetting({ role: v })} placeholder="чем занимаешься" maxLength={80} />
      <Field value={st.about || ''} onChangeText={(v) => setSetting({ about: v })} placeholder="что ещё о тебе знать ии" multiline maxLength={400} style={{ minHeight: 80, textAlignVertical: 'top' }} />
      <Field value={st.extra || ''} onChangeText={(v) => setSetting({ extra: v })} placeholder="пожелания к ответам" multiline maxLength={400} style={{ minHeight: 70, textAlignVertical: 'top' }} />

      {PERS.map(([k, title, opts]) => (
        <View key={k} style={{ gap: 8 }}>
          <Label t={title} />
          <Seg value={st[k] != null ? st[k] : k === 'style' ? 'normal' : ''} opts={opts.map((o) => [o[0], o[1]] as [string, string])} onChange={(v) => setSetting({ [k]: v })} />
        </View>
      ))}

      <Label t="память" />
      <Card>
        <Row title="запоминать факты о тебе" sub="ии сам добавляет устойчивые факты" right={<Switch value={st.memOn !== false} onValueChange={(v) => setSetting({ memOn: v })} trackColor={{ true: C.ok }} />} />
        {(st.memory || []).map((t, i) => <Row key={t} title={t} onPress={() => Alert.alert(t, undefined, [{ text: 'отмена', style: 'cancel' }, { text: 'удалить', style: 'destructive', onPress: () => removeMemory(i) }])} right={<Text style={{ color: C.mute }}>✕</Text>} />)}
      </Card>
      <Field value={mem} onChangeText={setMem} placeholder="добавить в память" maxLength={200} onSubmitEditing={() => { if (addMemory(mem)) setMem(''); }} />

      <Btn kind="danger" label="удалить все чаты" onPress={() => Alert.alert('удалить все чаты?', 'это нельзя отменить', [{ text: 'отмена', style: 'cancel' }, { text: 'удалить', style: 'destructive', onPress: clearAll }])} />
      <Text style={{ color: C.mute, textAlign: 'center', fontSize: 13, marginTop: 6 }}>DDX AI · создано @bauyrzhanov_12_</Text>
    </Sheet>
  );
}
