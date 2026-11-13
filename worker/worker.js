/* воркер w-chat: прокси к groq для обычного чата.
   ключ лежит только в секрете GROQ_API_KEY. необязательно: привязка KV (лимит на устройство в день),
   переменные ALLOWED_ORIGINS (через запятую), MODELS (через запятую), SYSTEM (характер ии), DAY_LIMIT. */

const API = 'https://api.groq.com/openai/v1/chat/completions';
const MODELS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
const SYSTEM = 'Ты дружелюбный ии-помощник. Отвечай по-русски, коротко и по делу, если не попросили иначе.';

const cors = (o) => ({ 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' });
const reply = (s, d, o) => new Response(JSON.stringify(d), { status: s, headers: Object.assign({ 'Content-Type': 'application/json' }, cors(o)) });

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || 'https://gdev49df.github.io').split(',').map((s) => s.trim());
    if (!allowed.includes(origin)) return reply(403, { error: 'origin не разрешён' }, origin || '*');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (req.method !== 'POST') return reply(405, { error: 'method' }, origin);
    if (!env.GROQ_API_KEY) return reply(500, { error: 'нет секрета GROQ_API_KEY' }, origin);

    const raw = await req.text();
    if (raw.length > 100000) return reply(413, { error: 'слишком большой запрос' }, origin);
    let body; try { body = JSON.parse(raw); } catch (e) { return reply(400, { error: 'json' }, origin); }

    const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-20)
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return reply(400, { error: 'messages' }, origin);

    // лимит запросов на устройство в день (если подключён KV)
    if (env.KV) {
      const device = String(body.device || '');
      if (!/^[A-Za-z0-9-]{16,64}$/.test(device)) return reply(400, { error: 'device' }, origin);
      const day = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
      const key = 'c:' + device + ':' + day;
      const used = parseInt(await env.KV.get(key), 10) || 0;
      const limit = Number(env.DAY_LIMIT || 50);
      if (used >= limit) return reply(429, { error: 'limit', limit: limit }, origin);
      await env.KV.put(key, String(used + 1), { expirationTtl: 172800 });
    }

    const models = env.MODELS ? String(env.MODELS).split(',').map((s) => s.trim()).filter(Boolean) : MODELS;
    let last = 'нет моделей';
    for (const model of models) {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.GROQ_API_KEY },
        body: JSON.stringify({ model: model, max_tokens: 1000, temperature: 0.6, messages: [{ role: 'system', content: env.SYSTEM || SYSTEM }].concat(msgs) })
      });
      if (!r.ok) { last = 'groq ' + r.status + ' (' + model + ')'; if ([400, 403, 404, 429].includes(r.status)) continue; break; }
      const j = await r.json();
      const text = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (text) return reply(200, { answer: text }, origin);
      last = 'пустой ответ (' + model + ')';
    }
    return reply(502, { error: 'upstream', detail: last }, origin);
  }
};
