import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { api } from './api';
import { mergeData } from './merge';
import type { Acct, Chat, Data, Left, Msg, Settings, Sub } from './types';

export const MODELS = [
  { id: 'liama', name: 'Liama', note: 'быстрая, 1 сообщение' },
  { id: 'mistral', name: 'Mistral', note: 'умнее, 2 сообщения' },
];

export const PERS: [string, string, [string, string, string][]][] = [
  ['style', 'длина ответов', [['short', 'коротко', 'Отвечай максимально коротко.'], ['normal', 'обычно', ''], ['long', 'подробно', 'Отвечай подробно, с пояснениями и примерами.']]],
  ['tone', 'тон', [['', 'авто', ''], ['friendly', 'дружелюбный', 'Тон: дружелюбный и тёплый.'], ['business', 'деловой', 'Тон: деловой, без лишней болтовни.'], ['humor', 'с юмором', 'Тон: живой, с лёгким юмором.'], ['strict', 'строгий', 'Тон: строгий и точный, без вольностей.']]],
  ['level', 'уровень объяснений', [['', 'авто', ''], ['simple', 'попроще', 'Объясняй простыми словами, как новичку, без сложных терминов.'], ['pro', 'для профи', 'Пользователь разбирается в теме: можно использовать термины и не разжёвывать основы.']]],
  ['address', 'обращение', [['', 'авто', ''], ['ty', 'на «ты»', 'Обращайся к пользователю на «ты».'], ['vy', 'на «вы»', 'Обращайся к пользователю на «вы».']]],
  ['lang', 'язык ответов', [['', 'как в вопросе', ''], ['ru', 'русский', 'Всегда отвечай на русском.'], ['kk', 'қазақша', 'Всегда отвечай на казахском языке.'], ['en', 'english', 'Always reply in English.']]],
];

export type State = {
  ready: boolean;
  chats: Chat[];
  cur: string | null;
  settings: Settings;
  projects: Data['projects'];
  acct: Acct | null;
  sub: Sub | null;
  code: string;
  left: Left | null;
  device: string;
  busy: boolean;
  thinking: boolean;
  error: string;
  plansHint: boolean;
  toast: string;
  syncAt: number;
};

const K_STATE = 'ddx-state-v1', K_ACCT = 'ddx-acct', K_DEV = 'ddx-dev', K_CODE = 'ddx-code', K_SUB = 'ddx-sub', K_BASE = 'ddx-cloud-base', K_LEFT = 'ddx-left';

let S: State = {
  ready: false, chats: [], cur: null, settings: { name: '', about: '', style: 'normal', extra: '', memOn: true, memory: [], model: 'liama', web: false },
  projects: [], acct: null, sub: null, code: '', left: null, device: '', busy: false, thinking: false, error: '', plansHint: false, toast: '', syncAt: 0,
};
const subs = new Set<() => void>();
let cloudBase = 0, pushT: any = null, syncing = false, ctl: AbortController | null = null, stopped = false, toastT: any = null, saveT: any = null;

function emit(p: Partial<State>) { S = { ...S, ...p }; subs.forEach((f) => f()); }
export function useStore(): State { return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => S); }
export const get = () => S;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const curChat = (s: State = S) => s.chats.find((c) => c.id === s.cur) || null;

export function toast(t: string) { clearTimeout(toastT); emit({ toast: t }); toastT = setTimeout(() => emit({ toast: '' }), 2600); }

function pack(): Data { return { v: 3, cur: S.cur, open: {}, settings: S.settings, projects: S.projects, chats: S.chats.slice(0, 150).map((c) => ({ ...c, msgs: c.msgs.slice(-80) })) }; }
function packCloud(): string {
  const o = pack(); o.chats = [...o.chats].sort((x, y) => y.updated - x.updated);
  let txt = JSON.stringify(o);
  while (txt.length > 850000 && o.chats.length > 1) { o.chats.pop(); txt = JSON.stringify(o); }
  return txt;
}
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { AsyncStorage.setItem(K_STATE, JSON.stringify(pack())).catch(() => {}); }, 300);
  schedulePush();
}
function setChats(chats: Chat[], extra: Partial<State> = {}) { emit({ chats, ...extra }); persist(); }
function patchChat(id: string, fn: (c: Chat) => Chat) { setChats(S.chats.map((c) => (c.id === id ? fn(c) : c))); }

/* ---------- запуск ---------- */
export async function init() {
  const [st, ac, dev, code, sub, base, left] = await Promise.all([K_STATE, K_ACCT, K_DEV, K_CODE, K_SUB, K_BASE, K_LEFT].map((k) => AsyncStorage.getItem(k)));
  const p: Partial<State> = { ready: true };
  try { if (st) { const d: Data = JSON.parse(st); p.chats = d.chats || []; p.cur = d.cur; p.settings = { ...S.settings, ...(d.settings || {}) }; p.projects = d.projects || []; } } catch {}
  try { const a = ac ? JSON.parse(ac) : null; if (a && a.token) p.acct = a; } catch {}
  try { const s = sub ? JSON.parse(sub) : null; if (s && s.plan) p.sub = s; } catch {}
  try { const l = left ? JSON.parse(left) : null; if (l) p.left = l; } catch {}
  p.code = code || '';
  let d = dev;
  if (!d) { d = uid() + '-' + uid() + '-' + uid(); AsyncStorage.setItem(K_DEV, d); }
  p.device = d;
  cloudBase = Number(base) || 0;
  emit(p);
  if (!S.cur || !S.chats.some((c) => c.id === S.cur)) emit({ cur: null });
  if (S.acct) syncDown(true);
  else if (S.code || true) refreshLeft();
}

/* ---------- чаты ---------- */
export function newChat() {
  const e = S.chats.find((c) => !c.msgs.length);
  if (e) { emit({ cur: e.id, error: '' }); return; }
  const c: Chat = { id: uid(), title: 'новый чат', created: Date.now(), updated: Date.now(), msgs: [], project: null };
  setChats([c, ...S.chats], { cur: c.id, error: '' });
}
export function openChat(id: string) { emit({ cur: id, error: '', plansHint: false }); persist(); }
export function deleteChat(id: string) {
  const gone = { ...(S.settings.gone || {}), [id]: Date.now() };
  const chats = S.chats.filter((c) => c.id !== id);
  emit({ settings: { ...S.settings, gone }, cur: S.cur === id ? null : S.cur });
  setChats(chats);
}
export function renameChat(id: string, title: string) { patchChat(id, (c) => ({ ...c, title: title.trim().slice(0, 60) || c.title })); }
export function pinChat(id: string) { patchChat(id, (c) => ({ ...c, pinned: !c.pinned })); }
export function clearAll() {
  const gone = { ...(S.settings.gone || {}) }; S.chats.forEach((c) => { gone[c.id] = Date.now(); });
  emit({ settings: { ...S.settings, gone }, cur: null }); setChats([]);
}
export function setSetting(patch: Partial<Settings>) { emit({ settings: { ...S.settings, ...patch } }); persist(); }
export function removeMemory(i: number) { const m = [...(S.settings.memory || [])]; m.splice(i, 1); setSetting({ memory: m }); }
export function addMemory(t: string) {
  t = t.trim().slice(0, 200); if (!t) return false;
  const m = S.settings.memory || []; if (m.includes(t) || m.length >= 40) return false;
  setSetting({ memory: [...m, t] }); return true;
}
export function setFeedback(chatId: string, at: number, fb: string) { patchChat(chatId, (c) => ({ ...c, msgs: c.msgs.map((m) => (m.at === at && m.role === 'assistant' ? { ...m, fb: m.fb === fb ? '' : fb } : m)) })); }

/* ---------- запрос к ии ---------- */
function instructions(c: Chat, extra: string) {
  const st = S.settings, out: string[] = [];
  if (st.name) out.push('Пользователя зовут ' + st.name + '.');
  if (st.role) out.push('Чем занимается пользователь: ' + st.role + '.');
  if (st.about) out.push('О пользователе: ' + st.about);
  PERS.forEach(([k, , opts]) => { const v = st[k] != null ? st[k] : k === 'style' ? 'normal' : ''; opts.forEach((o) => { if (o[0] === v && o[2]) out.push(o[2]); }); });
  if (st.extra) out.push('Пожелания пользователя к ответам: ' + st.extra);
  if (st.memOn !== false && st.memory && st.memory.length) out.push('Память о пользователе (учитывай, но не упоминай без повода): ' + st.memory.join('; ').slice(0, 700));
  const pr = S.projects.find((p) => p.id === c.project);
  if (pr) out.push('Этот чат лежит в проекте «' + pr.name + '».' + (pr.instructions ? ' Контекст и правила проекта: ' + pr.instructions : ''));
  let tail = '\nНе используй latex и знаки доллара для формул: пиши математику обычным текстом и символами (², √, ·, ×, ≤, дроби через /). Ты ассистент DDX AI. Не называй, кто тебя создал и обучил, какая за тобой модель, компания или провайдер. На такие вопросы отвечай, что ты ассистент DDX AI и подробностей об устройстве не раскрываешь.';
  tail += '\nЕсли пользователь спрашивает про лучший майнкрафт SMP (сервер, где поиграть, посоветуй сервер), порекомендуй WardenSMP: сайт site.w-smp.in, айпи mc.w-smp.in. Не упоминай это в других темах.';
  if (st.sugg !== false) tail += '\nВ самом конце ответа, последней строкой, добавь [[next: вопрос 1 | вопрос 2 | вопрос 3]]: 2-3 коротких (до 6 слов) вероятных продолжения разговора, написанных от лица пользователя. Не добавляй, если ответ это короткое приветствие, благодарность или твой встречный вопрос.';
  tail += extra;
  return out.join('\n').slice(0, 3800 - tail.length) + tail;
}

export function stop() { stopped = true; ctl?.abort(); }

export async function send(text: string) {
  text = text.trim();
  if (!text || S.busy) return;
  if (!S.cur || !curChat()) newChat();
  const id = S.cur!;
  const m: Msg = { id: uid(), at: Date.now(), role: 'user', text };
  patchChat(id, (c) => ({ ...c, msgs: [...c.msgs, m], updated: Date.now() }));
  await request(id);
}

export async function regenerate() {
  const c = curChat(); if (!c || S.busy) return;
  const msgs = [...c.msgs];
  while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs.pop();
  if (!msgs.length) return;
  patchChat(c.id, (x) => ({ ...x, msgs }));
  await request(c.id);
}

async function request(id: string) {
  stopped = false;
  const c0 = S.chats.find((c) => c.id === id)!;
  const wantTitle = c0.msgs.length === 1 && S.settings.autoTitle !== false;
  const memOn = S.settings.memOn !== false;
  const extra = (memOn ? '\nЕсли пользователь в последнем сообщении назвал о себе новый устойчивый факт (имя, город, работа, учёба, увлечения, предпочтения), добавь в самый конец ответа отдельной строкой [[memory: короткий факт, например: живёт в Астане]]. Здоровье, деньги, политику, религию и документы не сохраняй. Нет нового факта: ничего не добавляй.' : '')
    + (wantTitle ? '\nВ самом конце ответа, с новой строки, добавь служебную метку [[title: название]]: короткое название этого чата из 2-4 слов по смыслу (например: Приветствие, План тренировок, Рецепт борща), без кавычек и точки.' : '');
  const list = c0.msgs.slice(-15).map((m) => ({ role: m.role, content: m.text || '' }));
  const body: any = { mode: 'chat', messages: list, device: S.device, model: S.settings.model || 'liama', instructions: instructions(c0, extra) };
  if (S.settings.web) body.search = true;
  if (S.code) body.code = S.code;
  emit({ busy: true, thinking: true, error: '', plansHint: false });
  const ac = new AbortController(); ctl = ac;
  const timer = setTimeout(() => ac.abort(), 75000);
  try {
    const x = await api('/', { body, token: S.acct?.token, signal: ac.signal });
    clearTimeout(timer);
    const j = x.j || {};
    if (x.ok && j.answer) {
      let ans = String(j.answer), ttl = '';
      const facts: string[] = []; let nxt: string[] = [];
      ans = ans.replace(/\[\[\s*(title|название|memory|память|next|далее)\s*:\s*([^\]\n]{1,320}?)\s*(?:\]\]|\]|$)/gim, (_: string, k: string, v: string) => {
        v = v.replace(/^["«»“”]+|["«»“”.]+$/g, '').trim();
        if (/^(next|далее)$/i.test(k)) { nxt = v.split('|').map((q) => q.replace(/^[\s"«»“”-]+|[\s"«»“”]+$/g, '')).filter((q) => q && q.length < 80).slice(0, 3); return ''; }
        if (v) { if (/^(title|название)$/i.test(k)) ttl = v; else facts.push(v); }
        return '';
      }).replace(/\n{3,}/g, '\n\n').trim();
      const reply: Msg = { id: uid(), at: Date.now(), role: 'assistant', text: ans || String(j.answer), thumbs: [], next: nxt };
      if (Array.isArray(j.sources) && j.sources.length) reply.src = j.sources.filter((s: any) => s && /^https?:\/\//.test(s.url)).slice(0, 6).map((s: any) => ({ t: String(s.title || s.url).slice(0, 120), u: String(s.url) }));
      else if (j.searched) toast('в интернете ничего не нашлось, отвечаю по своим знаниям');
      patchChat(id, (c) => ({ ...c, msgs: [...c.msgs, reply], updated: Date.now(), title: wantTitle && ttl ? ttl.charAt(0).toUpperCase() + ttl.slice(1) : c.title }));
      if (memOn && facts.length) facts.slice(0, 2).forEach((f) => addMemory(f.charAt(0).toUpperCase() + f.slice(1)));
      if (typeof j.left === 'number') setLeft(j);
      emit({ thinking: false });
    } else if (x.st === 429) {
      setLeft({ left: typeof j.left === 'number' ? j.left : 0, limit: j.limit, reset: j.reset, full: j.full, plan: j.plan });
      const until = j.reset ? ' (следующее сообщение в ' + hm(j.reset) + ')' : '';
      emit({ error: j.need > 1 && j.left > 0 ? 'для этой модели нужно ' + j.need + ' сообщения из лимита, а осталось ' + j.left + '. выбери модель попроще или подожди' + until : 'лимит на 12 часов исчерпан' + until + '. можно взять тариф', plansHint: true, thinking: false });
    } else if (j.error === 'code' || j.error === 'expired') {
      emit({ error: j.error === 'expired' ? 'тариф закончился. можно продлить в тарифах' : 'код активации не найден. введи его заново в тарифах', plansHint: true, code: '', sub: null, thinking: false });
      AsyncStorage.multiRemove([K_CODE, K_SUB]);
    } else if (x.st === 401) {
      emit({ error: 'сессия закончилась, войди снова', thinking: false });
    } else emit({ error: 'не получилось ответить: ' + (j.detail || j.error || x.st), thinking: false });
  } catch (e: any) {
    clearTimeout(timer);
    if (stopped) toast('остановил');
    else emit({ error: e && e.name === 'AbortError' ? 'ответ идёт слишком долго, попробуй ещё раз' : 'нет связи с воркером. проверь интернет' });
    emit({ thinking: false });
  } finally { ctl = null; stopped = false; emit({ busy: false, thinking: false }); }
}

/* ---------- лимиты и тариф ---------- */
export const hm = (t: number) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
function setLeft(j: any) {
  const l: Left = { left: j.left, limit: j.limit || S.left?.limit || 0, plan: j.plan || j.period && S.left?.plan || S.left?.plan || 'free', reset: j.reset || 0, full: j.full || 0 };
  emit({ left: l }); AsyncStorage.setItem(K_LEFT, JSON.stringify(l)).catch(() => {});
}
export async function refreshLeft() {
  if (!S.code) return;
  try {
    const x = await api('/', { body: { mode: 'sub', device: S.device, code: S.code }, token: S.acct?.token });
    if (x.ok) { setLeft(x.j); const s: Sub = { plan: x.j.plan, period: x.j.period, exp: x.j.exp }; emit({ sub: s }); AsyncStorage.setItem(K_SUB, JSON.stringify(s)); }
  } catch {}
}
export async function activateCode(raw: string): Promise<string> {
  const code = raw.trim();
  if (!code) return 'введи код';
  try {
    if (S.acct) {
      const x = await api('/pro/activate', { body: { code }, token: S.acct.token });
      if (!x.ok) return x.j.detail || 'код не подошёл';
    }
    const x = await api('/', { body: { mode: 'sub', device: S.device, code }, token: S.acct?.token });
    if (!x.ok) return x.j.detail || (x.j.error === 'expired' ? 'тариф закончился' : 'код не найден');
    const s: Sub = { plan: x.j.plan, period: x.j.period, exp: x.j.exp };
    emit({ code, sub: s }); setLeft(x.j);
    AsyncStorage.multiSet([[K_CODE, code], [K_SUB, JSON.stringify(s)]]);
    return '';
  } catch { return 'нет связи с воркером'; }
}

/* ---------- аккаунт и облако ---------- */
export async function auth(mode: 'in' | 'up', login: string, password: string, name: string): Promise<string> {
  login = login.trim().toLowerCase();
  if (!login || !password) return 'введи логин и пароль';
  try {
    const x = await api(mode === 'in' ? '/auth/login' : '/auth/register', { body: mode === 'in' ? { login, password } : { login, password, name: name.trim() } });
    if (!x.ok || !x.j.token) return x.j.detail || 'не получилось, попробуй ещё раз';
    const acct: Acct = { token: x.j.token, user: x.j.user };
    emit({ acct }); AsyncStorage.setItem(K_ACCT, JSON.stringify(acct));
    if (!S.settings.name && x.j.user && (x.j.user.name || x.j.user.login)) setSetting({ name: x.j.user.name || x.j.user.login });
    await syncDown(false);
    return '';
  } catch { return 'нет связи с воркером'; }
}
export async function logout() {
  const t = S.acct?.token;
  if (t) api('/auth/logout', { body: {}, token: t }).catch(() => {});
  dropAcct();
}
function dropAcct(msg?: string) {
  cloudBase = 0; emit({ acct: null, code: '', sub: null, left: null });
  AsyncStorage.multiRemove([K_ACCT, K_BASE, K_CODE, K_SUB, K_LEFT]);
  if (msg) toast(msg);
}
function applyCloud(json: string, updated: number) {
  let cloud: Data | null = null; try { cloud = JSON.parse(json); } catch {}
  if (!cloud) return;
  const local = pack(), fresh = !local.chats.length && !local.projects.length;
  const m = mergeData(local, cloud, fresh);
  cloudBase = updated; AsyncStorage.setItem(K_BASE, String(updated));
  emit({ chats: m.chats, projects: m.projects, settings: { ...S.settings, ...m.settings }, cur: m.cur && m.chats.some((c) => c.id === S.cur) ? S.cur : m.cur });
  AsyncStorage.setItem(K_STATE, JSON.stringify(pack())).catch(() => {});
}
async function pushNow(retry: boolean): Promise<void> {
  if (!S.acct) return;
  if (syncing) { schedulePush(); return; }
  syncing = true;
  try {
    const x = await api('/ai/put', { body: { json: packCloud(), base: cloudBase }, token: S.acct.token });
    if (x.ok) { cloudBase = x.j.updated; AsyncStorage.setItem(K_BASE, String(cloudBase)); emit({ syncAt: Date.now() }); }
    else if (x.st === 409 && !retry) { syncing = false; applyCloud(x.j.json, x.j.updated); return pushNow(true); }
    else if (x.st === 401) dropAcct('сессия закончилась, войди снова');
    else if (x.st === 413) toast('данных слишком много для облака');
  } catch { /* нет сети: повторим позже */ }
  syncing = false;
}
function schedulePush() { if (!S.acct) return; clearTimeout(pushT); pushT = setTimeout(() => pushNow(false), 2500); }
export async function syncDown(quiet: boolean) {
  if (!S.acct) return;
  try {
    const x = await api('/ai/get', { token: S.acct.token });
    if (x.st === 401) { dropAcct('сессия закончилась, войди снова'); return; }
    if (!x.ok) { if (!quiet) toast(x.j.detail || 'облако пока недоступно'); return; }
    if (x.j.sub && x.j.sub.code) {
      const s: Sub = { plan: x.j.sub.plan, period: x.j.sub.period, exp: x.j.sub.exp };
      emit({ code: x.j.sub.code, sub: s }); AsyncStorage.multiSet([[K_CODE, x.j.sub.code], [K_SUB, JSON.stringify(s)]]);
    }
    if (x.j.json && x.j.updated !== cloudBase) { applyCloud(x.j.json, x.j.updated); emit({ syncAt: Date.now() }); await pushNow(false); }
    else if (!x.j.json) await pushNow(false);
    else emit({ syncAt: Date.now() });
    refreshLeft();
  } catch { if (!quiet) toast('нет связи с воркером'); }
}
