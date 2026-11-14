export type Alt = { text: string; src: Src[]; at: number };
export type Src = { t: string; u: string };
export type Msg = {
  id?: string; at: number; role: 'user' | 'assistant'; text: string;
  src?: Src[]; next?: string[]; alts?: Alt[] | null; vi?: number; fb?: string;
  thumbs?: string[]; files?: { name: string; text?: string }[];
};
export type Chat = {
  id: string; title: string; pinned?: boolean; project?: string | null;
  created: number; updated: number; ord?: number | null; msgs: Msg[];
};
export type Settings = {
  name?: string; role?: string; about?: string; extra?: string;
  style?: string; tone?: string; level?: string; address?: string; lang?: string;
  memOn?: boolean; memory?: string[]; model?: string; web?: boolean;
  autoTitle?: boolean; sugg?: boolean; gone?: Record<string, number>;
  [k: string]: any;
};
export type Project = { id: string; name: string; instructions?: string; [k: string]: any };
export type Data = { v: 3; cur: string | null; open?: any; settings: Settings; projects: Project[]; chats: Chat[] };
export type Acct = { token: string; user: { login: string; name?: string; [k: string]: any } };
export type Sub = { plan: string; period?: string; exp?: number | null };
export type Left = { left: number; limit: number; plan: string; reset: number; full: number };
