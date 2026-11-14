import type { Data, Chat, Settings } from './types';

const blank = (v: any) => v == null || v === '' || (Array.isArray(v) && !v.length);

// то же слияние, что в веб-версии: чаты и проекты по id (новее побеждает), память складывается, удалённое не воскресает
export function mergeData(a: Data, b: Data, preferCloud: boolean): Data {
  const sa: Settings = a.settings || {}, sb: Settings = b.settings || {};
  const gone = Object.assign({}, sb.gone || {}, sa.gone || {});
  const st: Settings = {};
  const union = <T extends { id: string; updated?: number }>(la: T[] | undefined, lb: T[] | undefined, pickNew: boolean) => {
    const m: Record<string, T> = {};
    (lb || []).concat(la || []).forEach((x) => {
      if (!x || !x.id || gone[x.id]) return;
      const o = m[x.id];
      if (!o || !pickNew || (x.updated || 0) >= (o.updated || 0)) m[x.id] = x;
    });
    return Object.keys(m).map((k) => m[k]);
  };
  Object.keys(Object.assign({}, sb, sa)).forEach((k) => {
    if (k === 'memory' || k === 'skills' || k === 'gone' || k === 'stick') return;
    st[k] = preferCloud ? (blank(sb[k]) ? sa[k] : sb[k]) : (blank(sa[k]) ? sb[k] : sa[k]);
  });
  const seen: Record<string, 1> = {};
  st.memory = (sa.memory || []).concat(sb.memory || []).filter((t) => (seen[t] ? false : (seen[t] = 1)));
  const sk: Record<string, any> = {};
  (sb.skills || []).concat(sa.skills || []).forEach((k: any) => { sk[k.cmd] = k; });
  st.skills = Object.keys(sk).map((k) => sk[k]);
  st.gone = gone;
  const chats = union<Chat>(a.chats, b.chats, true).sort((x, y) => (y.updated || 0) - (x.updated || 0));
  const cur = chats.some((c) => c.id === a.cur) ? a.cur : chats.some((c) => c.id === b.cur) ? b.cur : null;
  return { v: 3, cur, open: Object.assign({}, b.open || {}, a.open || {}), settings: st, projects: union(a.projects, b.projects, false), chats };
}
