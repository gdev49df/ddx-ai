// воркер тот же, что у веб-версии. нативное приложение не шлёт Origin само,
// а воркер пускает только свой сайт, поэтому подставляем его вручную.
export const API = 'https://ddx-ai.wsmp.workers.dev';
export const ORIGIN = 'https://gdev49df.github.io';

export type ApiRes = { ok: boolean; st: number; j: any };

export async function api(
  path: string,
  opts: { body?: any; token?: string; method?: string; signal?: AbortSignal } = {},
): Promise<ApiRes> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: ORIGIN };
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
  const r = await fetch(API + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  let j: any = {};
  try { j = await r.json(); } catch { j = {}; }
  return { ok: r.ok, st: r.status, j };
}
