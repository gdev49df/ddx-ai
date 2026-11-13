/* воркер ddx planner.
   1) прокси к groq: прячет ключ от браузера. ключ лежит только в секрете GROQ_API_KEY, в репозитории его нет.
      режимы: food (фото еды -> блюда и калории) и ask (вопрос по данным пользователя).
   2) пуш-уведомления для напоминаний на iphone, когда приложение закрыто.
      приложение присылает сюда список ближайших напоминаний, а cron каждую минуту рассылает те, что подошли.
      хранилище: KV-привязка KV, ключи vapid генерируются сами при первом запросе. */

const API = 'https://api.groq.com/openai/v1/chat/completions';

const FOOD_SYSTEM = 'Ты определяешь еду на фото для дневника питания. Отвечай только JSON без пояснений и без markdown: '
  + '{"items":[{"name":"блюдо по-русски","grams":число,"kcal":число}],"note":"короткое замечание или пустая строка"}. '
  + 'Граммы и калории оценивай по виду порции и будь честен: это приблизительная оценка. Если на фото нет еды, верни {"items":[],"note":"еды не видно"}.';

const ASK_SYSTEM = 'Тебя зовут DDX AI. Ты личный ИИ-помощник в приложении DDX Planner. Если спросят, кто ты, как тебя зовут или что ты умеешь, отвечай: «Я DDX AI, твой персональный помощник в DDX Planner. Помогаю разобраться с задачами, встречами, едой, тратами и привычками». Ты ИИ, а не человек. Если спросят, на какой модели ты работаешь или кто тебя создал, скажи, что ты DDX AI и подробностями о внутреннем устройстве не делишься. '
  + 'Пользователь спрашивает про свою жизнь: задачи, встречи, еду, траты, привычки. '
  + 'Ниже его данные из приложения. Отвечай по-русски, коротко и по делу, только по этим данным. '
  + 'Если данных для ответа нет, так и скажи. Не выдумывай. Не давай медицинских и финансовых предписаний, только наблюдения и советы по организации дня.';

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function reply(status, data, origin) {
  return new Response(JSON.stringify(data), { status: status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors(origin)) });
}

// groq: формат как у openai chat completions.
// модели пробуются по очереди: если одна недоступна на ключе (404/400/403), берётся следующая
const ASK_MODELS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
const FOOD_MODELS = ['qwen/qwen3.8-27b', 'meta-models/muse-spark-open'];
const list = (v, def) => (v ? String(v).split(',').map((x) => x.trim()).filter(Boolean) : def);

// вставка 1: положи сразу после строки  const list = (v, def) => ...
// если раньше вставлял старую версию этой вставки, замени её целиком на эту
const CHAT_MODELS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
const CHAT_SYSTEM = 'Ты DDX AI, дружелюбный помощник. Отвечай на любые вопросы по-русски (или на языке пользователя), коротко и по делу, если не попросили подробнее. '
  + 'Умеешь разбирать фото: описывать, читать текст, переводить, решать задачи со снимка. Если фото нет или оно не открылось, так и скажи. '
  + 'Можно использовать markdown: списки, **жирный**, `код`, блоки кода и простые таблицы. Не выдумывай факты: если не уверен, скажи об этом.';
const CHAT_IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

async function chatLlm(env, models, messages, extra) {
  let last = 'нет моделей';
  // персонализация и контекст проекта от пользователя дополняют системную подсказку, но не отменяют её
  const system = (env.CHAT_SYSTEM || CHAT_SYSTEM) + (extra ? '\n\nНастройки пользователя (учитывай их в ответах):\n' + extra : '');
  for (const model of models) {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + env.GROQ_API_KEY },
      body: JSON.stringify({ model: model, max_tokens: 1500, temperature: 0.6, messages: [{ role: 'system', content: system }].concat(messages) })
    });
    if (!r.ok) { last = 'groq ' + r.status + ' (' + model + ')'; if ([400, 403, 404, 429].includes(r.status)) continue; break; }
    const j = await r.json();
    const text = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (text) return text;
    last = 'пустой ответ (' + model + ')';
  }
  throw new Error(last);
}

async function llm(env, models, system, userContent, maxTokens, json) {
  let last = null;
  for (const model of models) {
    const body = { model: model, max_tokens: maxTokens, temperature: 0.3, messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }] };
    if (json) body.response_format = { type: 'json_object' };
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + env.GROQ_API_KEY }, body: JSON.stringify(body) });
    if (!r.ok) {
      let msg = '';
      try { const e = await r.json(); msg = (e.error && e.error.message) || ''; } catch (x) { /* тела нет */ }
      last = new Error('groq ' + r.status + ' (' + model + ')' + (msg ? ': ' + msg.slice(0, 140) : ''));
      if (r.status === 404 || r.status === 400 || r.status === 403 || r.status === 429) continue;
      throw last;
    }
    const j = await r.json();
    const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    // у некоторых моделей в ответе есть блок рассуждений, его не показываем
    const clean = String(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (clean) return clean;
    last = new Error('groq: пустой ответ (' + model + ')');
  }
  throw last || new Error('groq: нет моделей');
}


/* ================= web push (vapid + aes128gcm, rfc 8291) ================= */

const enc = new TextEncoder();
const b64u = (bytes) => btoa(String.fromCharCode.apply(null, Array.from(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; };
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; a.forEach((x) => { o.set(x, p); p += x.length; }); return o; };

async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt, info: info }, k, len * 8));
}

async function encryptPayload(sub, text) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const prk = await hkdf(auth, secret, cat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const data = cat(enc.encode(text), new Uint8Array([2]));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, data));
  return cat(salt, new Uint8Array([0, 0, 16, 0, 65]), asPub, ct);
}

async function vapidJwt(aud, vapid, subject) {
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', vapid.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + claims)));
  return head + '.' + claims + '.' + b64u(sig);
}

async function sendPush(env, vapid, sub, payload) {
  const url = new URL(sub.endpoint);
  const jwt = await vapidJwt(url.origin, vapid, env.VAPID_SUBJECT || 'https://gdev49df.github.io');
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'TTL': '3600', 'Urgency': 'high', 'Authorization': 'vapid t=' + jwt + ', k=' + vapid.pub },
    body: await encryptPayload(sub, JSON.stringify(payload))
  });
  return r.status;
}

// пушить можно только на адреса настоящих push-сервисов
function goodEndpoint(ep) {
  try {
    const u = new URL(ep);
    return u.protocol === 'https:' && (u.hostname.endsWith('.push.apple.com') || u.hostname === 'fcm.googleapis.com' || u.hostname.endsWith('.push.services.mozilla.com') || u.hostname.endsWith('.notify.windows.com'));
  } catch (e) { return false; }
}

async function subId(endpoint) {
  return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(endpoint)))).slice(0, 24);
}

async function loadDb(env) {
  const raw = env.KV ? await env.KV.get('db') : null;
  let db = {};
  try { db = raw ? JSON.parse(raw) : {}; } catch (e) { db = {}; }
  if (!db.subs) db.subs = {};
  if (!db.vapid) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    db.vapid = { pub: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))), priv: await crypto.subtle.exportKey('jwk', kp.privateKey) };
    await env.KV.put('db', JSON.stringify(db));
  }
  return db;
}
const saveDb = (env, db) => env.KV.put('db', JSON.stringify(db));

// каждую минуту: рассылаем напоминания, время которых пришло
async function runDue(env) {
  if (!env.KV) return;
  const now = Date.now();
  let db = await loadDb(env);
  const sent = [];   // [subId, key]
  const dead = [];
  for (const id of Object.keys(db.subs)) {
    const rec = db.subs[id];
    for (const it of rec.items || []) {
      if (it.ts > now) continue;
      const key = it.id + ':' + it.ts;
      if (now - it.ts < 24 * 3600000 && !(rec.sent && rec.sent[key])) {
        let st = 0;
        try { st = await sendPush(env, db.vapid, rec.sub, { title: it.title, body: it.body, tag: it.id }); } catch (e) { st = 0; }
        if (st === 404 || st === 410) { dead.push(id); break; }
      }
      sent.push([id, key]);
    }
  }
  if (!sent.length && !dead.length) return;
  db = await loadDb(env);   // свежая копия: пока слали, приложение могло прислать новые данные
  dead.forEach((id) => { delete db.subs[id]; });
  sent.forEach(([id, key]) => {
    const rec = db.subs[id]; if (!rec) return;
    rec.sent = rec.sent || {}; rec.sent[key] = now;
    rec.items = (rec.items || []).filter((x) => x.id + ':' + x.ts !== key);
  });
  Object.values(db.subs).forEach((rec) => { Object.keys(rec.sent || {}).forEach((k) => { if (now - rec.sent[k] > 2 * 86400000) delete rec.sent[k]; }); });
  await saveDb(env, db);
}

async function pushRoute(req, env, path, origin) {
  if (!env.KV) return reply(500, { error: 'no kv', detail: 'в воркере нет привязки KV' }, origin);
  if (path === '/push/key') { const db = await loadDb(env); return reply(200, { key: db.vapid.pub }, origin); }
  if (req.method !== 'POST') return reply(405, { error: 'method' }, origin);
  const raw = await req.text();
  if (raw.length > 60000) return reply(413, { error: 'too big' }, origin);
  let body; try { body = JSON.parse(raw); } catch (e) { return reply(400, { error: 'json' }, origin); }
  const sub = body.sub;
  if (!sub || !goodEndpoint(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return reply(400, { error: 'sub' }, origin);
  const id = await subId(sub.endpoint);
  const db = await loadDb(env);

  if (path === '/push/test') {
    const st = await sendPush(env, db.vapid, sub, { title: 'DDX Planner', body: 'Пуш-уведомления работают', tag: 'test' });
    return reply(st >= 200 && st < 300 ? 200 : 502, { status: st }, origin);
  }
  if (path === '/push/off') { delete db.subs[id]; await saveDb(env, db); return reply(200, { ok: true }, origin); }
  if (path === '/push/sync') {
    const old = db.subs[id] || {};
    const sentMap = old.sent || {};
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 40).map((x) => ({
      id: String(x.id || '').slice(0, 40), ts: Math.round(Number(x.ts) || 0), title: String(x.title || '').slice(0, 120), body: String(x.body || '').slice(0, 160)
    })).filter((x) => x.id && x.ts > 0 && !sentMap[x.id + ':' + x.ts]);
    if (Object.keys(db.subs).length > 200 && !db.subs[id]) return reply(429, { error: 'full' }, origin);
    db.subs[id] = { sub: { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } }, items: items, sent: sentMap, at: Date.now() };
    await saveDb(env, db);
    return reply(200, { ok: true, count: items.length }, origin);
  }
  return reply(404, { error: 'path' }, origin);
}

/* ================= лимиты ии на сервере =================
   клиентским лимитам верить нельзя, поэтому считаем запросы здесь: отдельно вопросы и фото еды, по устройству и по дню.
   день считается по времени астаны (UTC+5, переменная TZ_OFFSET). нужен KV. */

// хеши кодов активации pro (хеш:дни). этот блок обновляет команда node tools/make-code.js, вручную не трогай
// CODES-BEGIN
const BUILTIN_CODES = '57e0a2d85c1202b8214a441964feded9d77d6989bfff4242ce78ab2ac7cb2712:31,ebfe967d4597c60d219098668225a324fd77ed5f3b79d7dd45730b31bf91ac85:31,9ee5d7c10e41e38bf4f517b8483804d87d4d624d4868513c6f1621a4c3a78349:31,d415aa890c1643e046b1af6eefe6f0db70a0c4d79a7475337adf9a10217eeace:366,be48b176c1c1d48c37ece86525164ccd6fe8f2563dd2cc6f797e6154a45956fa:366,870ef2c9437df5773a0aa05f53528f93dd995ce287d277eaa561b998cb22d57a:366,e3649ab8a6d6856d7c43e1435359b5decd16ca45e291974a9eca0fd1cf3bb53e:31,55fd1fec110dff75574854e8c442a409a30c721f20824c5f3207c79678f72e9c:31,06fcdf4f9ffd57f29865b6cb2ef034fbc7f3116a671b0a02d92ff7e31855d39d:31,a6dd3b1b669521ed56e5879377d24e8b4b52cafe831e8bf3d1d7ed3581ef8988:31,262d15a3863ed410b0895e974f4ca8742e00922d80ee11428f915eb83b3c9cdc:31,6e1ad043339ff34473e850b82bb5f0a8fb769bd349e9774736a7f934b3850243:31,380dbb6a9b393fd4ee5ab32cbf1171c73960229c3d54d375eb2cb5b2d5fdf764:31,d9a6ea9fc78e49ecf09a245208f17ea9298bb0c892d917fae7e65f1b780a513a:31,9a2cbe90825ba713e271fe2db3a19490a566f45bc18e3c1866004b9f1cea0d34:31,bd98b2118502b60584aa54a3f1e1f26ed5437d1f3af788fc485ee8c242195d9a:31,0415bb4abbb970ec94b994b22eaa5a92942085d8eb321059e999d057398b083a:31,2ffaee9c958ee93c282e48071f7d06ee2c2e99d38d3f386473274a8b5b1dc2e0:31,f0e86fc6d092de91ec4ebb90f8ae73f3b948e4232583672b2d19e41c7b5a7882:31,7a3dbca6fb55f9566e71e63af10d8ee1dd4f3f3620ea2ba6acc69aab2a5a5dff:31,fd4f5b404ad1dd56688d88d32f4bae4201e3278a48809b845394ebc3cf36553d:31,bfd390353b71a7abc71d0e2f709aae545ae6a0a73599516781af42e89abd5aac:31,7a9d9a4be90c6fb54dc1e94dd975f4adecedf2856dc1c245dd905d28cc53ddaa:31,dc33544cccb5833d7c234e39d5ed763a49c0dda0b2824c9c7b00a075258b5170:31,13e2b61b9d00d22de27434d929f860465d7411e7aa3458a023a56292e7b529bc:31,08cd3e3058880a079090e2699ae765cc81b1e1c34f09f940a0ac251e298b28c8:31,c8d24bea141e35452a6fc8131fba76d272a04a430f693ab7be88a6a413ac31f5:31,6a277d6a6e3724d994bac743298b2e0867a8d9268e311236be3d59fe470184d4:31,22d08b5c46719e203587274d1075b0acd4cdac198e6e48533e8d2c37f63d1b97:31,f6bd1235eeeccd04ded279c239d11587f21847ff8ce5117fa943430f7f0e34f7:31,628c664b941c82c6f674aa89d7c1c256b4b1f289e50f20ee45bd8b4ecc2b0110:31,8a727bf2a86129d4d13e99c925552d4b89959e4195dadfc6c316f279c14e79e8:31,333465b12df12b3cf1782d037dcac0cda18bf274e558cea2fb1c3c83639dfc96:31,dd00e4f907e3babcea0e630f9f3d789da3da7da9902f2ad1df9b31c7e5ebb36b:31,a071440088d1047c508f7c5209e4e8e2a517bf9cd27be7019f6ad5f3fbde1f71:31,4ca115b2907e81703c74c61df59bd87a144cf4cb849cef98e947d7347a8eb24b:31,194c581805e95f35d44ee4fb1b752671eea9871b62e7c29175e44fc036cd40bf:31,24b9ae4efdcfd818e5184df8240e62da7a57c793c82abf6ca8d19ef1f07e7e23:31,a35b52afa9b5b310dbe638976567b7c8e3a246e220d7b5c0c1284ef05f2bd129:31,ef55ad566975533361846b42322201f8cb547cfa7a44e5b13ba5dd3b26a8150c:31,0def9afad12df1c4ca0eabec59bfd766c398ab812d00de641ac55715a07c6387:31,5b5ad3fbde9c11577f01716efec26555976aee7f9373785066639db4139ebf8e:31,ea7a448c31d79d93a0aa61067c870010b1cdb00c0564ad92651e73a2c9933d19:31,72d965a87c5760a240398d9caa87a7b4ad7b8641a8399307541ba5e33339397d:31,02d52f963fe05bb9070214814b2be4d741393bcbfdf38f9a636c68e3d4d69a8d:31,36b4db2d3a1ba13332e9f0733a91f0a5ec28cf2b18fb825f48bc1455c2f33027:31,846e09b37c6e73bd3c56e7e11a140ac0cc16b55e9d3ccffe3bc25f9d97fd337f:31,3e8f039811079ca422c524f68269d20c5d65edd485b91e0f48fe06ca8c8abdff:31,f59677d384800df76dd3aae1513c4f6223218c19ca65929d4ff7c89217c835da:31,935bd10b10e38435aa6bc056bf3dd684c4aa5f7f0e0542a65c281a1387ae2349:31,e136b13d209e6c35b4d5fb7f5c0a33eb8a31258d1a203ffa4f4fc0d0637a6e39:31,319cf65840853eff93280e1233f4d3ce5f68bf545f76b09966754578b5a5ef4e:31,8f59944cef894f8bafb2840b34d5dbf2b03fbc454e1d6f62b0d803c8d02849f1:31,783d0c802725a646b6d88d90b2ee2746d76d13c5e01abd8e7624218a3fef6e7a:31,5cd29de500224d6f046ef13d6aa3151a188068f6776fa8886d1358cef0166e88:31,bc08a0b40db215e7dd3622beef8d644afd169b5b7d0c5c61cfe5d05edf695df3:31,57b563fe71d9aa33e0d87e37533ab517b72bd0378169fa5b1a4a8b966fd3160b:366,8557869a20386cf20793bf0035e042367e7689710af57671c0338e7a117596d8:366,abcc53f0046c746a1669e215a757eb6146bceece854d3eb1917a67f30aeea8ef:366,fb565da3df3647e0dd3eb7f5f4b31df1c81e52d7d46410c9bcfeb11463fcbe69:366,074e4654e31ed4a671854f4a2c187b33713ff7e103186b12485b48f10a778a35:366,e3b01b42228b6f547b3b5657ef6a97ac3290f933b9cf385c301687f92b99dc16:366,a4bd36543dbd644630f5a9e2ca4b6397343d16822baad8ec2179489166f43424:366,fbd859cf4a3574e8b424408a4d96f6abaf0e38b32b8e878a742f7734f6d23255:366,f7595e1039538aff676adcd54ef138304703ce0d9cc11ff3965a9a250e23308a:366,c7c19b231cbcc744e9f7b29c2af57795a04de887b368b67c9f1acf332f49f4b0:366,322629ddb6c4ef34d18748dd4ade269522ae787d62f5cde2c5901679f64c7597:366,b74cf6b8d9b231c12f906558726aeee9b5602191ac4b5a09f7e7315e1e776f7d:366,1c00a4fe62fb76bc65025e5c3aa89024ff53cd75ba4e23e6ceb5508b86c2cd10:366,b8b75c8ad779fc51e236c414295152f27bce9f464b6eba4eef7d25681ec320a7:366,61c9350edbc988a2266e765f80e88589508ff31502432d34bf42e07d8a65851c:366,e2d4018b1b1200ee412290f2c2daf516626b57ba5a20d876a15cf138320b9b11:366,19ccf615ba1659560efedc2f1bd71dfaf65035c5ef88a95d8ea8f2f3d0ea3187:366,c045b34e900fbd0b536d8f31e2f7bd5f092d39584f54f00ddd347e206fc3907b:366,201ef9aa75809aa222c55019f4ecf17d50c0d3a3fd2b440617ae05e9306766e6:366,cae053c064bdb4917b84895b0060b5971b4e2bae05b851d595fd34cf97ea0849:366,084992b99d11b16e8c4c86259d35b6573555f5010e55384177029a45a3d63d53:36500,4a814e3c22554b9e3c24162725e7af59b9e59ccb72b33c67cadc8f5d306602de:36500,4de2b9b084a8e00950fb9d0e3c3a1adb1d638237728ce3ef458c5cda21fe1385:36500,2f9b864ef5e1fd3ad0a8ceaf680d98a864ce191743a3335bfd4d4ae4878856ac:36500,35cfa31b4343bc48a1121d1aafa7b464064cc85fffd29654d2963a16d040537a:36500';
// CODES-END

const FREE_Q = { ask: 10, food: 2 };
const PRO_Q = { ask: 40, food: 15 };
const LIFE_Q = { ask: 1000, food: 300 };   // Founder Lifetime: практически без лимитов
const GLOBAL_DAY = 1500;   // общий предохранитель на все запросы за день, чтобы ключ groq не улетел в минус

const dayKey = (env) => new Date(Date.now() + Number(env.TZ_OFFSET || 5) * 3600000).toISOString().slice(0, 10);
const num = (v) => Math.max(0, parseInt(v, 10) || 0);

async function sha256hex(s) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// pro: проверяем код активации (список зашит в BUILTIN_CODES, можно добавить свои в переменную PRO_CODES) и привязываем его к первому устройству.
// если список пуст, верим приложению, но лимиты pro всё равно ограничены
async function isProDevice(env, body, device) {
  const list = (BUILTIN_CODES + ',' + String(env.PRO_CODES || '')).split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) return body.pro === true;
  const code = String(body.code || '').slice(0, 64);
  if (!code) return false;
  const hash = await sha256hex(code);
  const ent = list.map((x) => x.split(':')).find((x) => x[0] === hash);
  if (!ent) return false;
  const days = Number(ent[1]) || 31;
  const key = 'p:' + hash;
  let rec = null;
  try { rec = JSON.parse(await env.KV.get(key)); } catch (e) { rec = null; }
  if (!rec) { rec = { device: device, at: Date.now() }; await env.KV.put(key, JSON.stringify(rec)); }
  if (!(rec.device === device && Date.now() < rec.at + days * 86400000)) return false;
  return days >= 36000 ? 'life' : true;
}

// списывает одну попытку. возвращает { info, refund } или { status, payload }
async function takeQuotaDevice(env, body, kind) {
  if (!env.KV) return { info: null, refund: async () => {} };
  const device = String(body.device || '');
  if (!/^[A-Za-z0-9-]{16,64}$/.test(device)) return { status: 400, payload: { error: 'device' } };
  const day = dayKey(env);
  const pro = await isProDevice(env, body, device);
  const cap = (pro === 'life' ? LIFE_Q : pro ? PRO_Q : FREE_Q);
  const qk = 'q:' + device + ':' + day, gk = 'g:' + day;
  let q = { ask: 0, food: 0 };
  try { q = Object.assign(q, JSON.parse(await env.KV.get(qk))); } catch (e) { /* первый запрос за день */ }
  const info = () => ({ pro: pro, ask: { used: q.ask, limit: cap.ask }, food: { used: q.food, limit: cap.food } });
  if (q[kind] >= cap[kind]) return { status: 429, payload: { error: 'limit', kind: kind, quota: info() } };
  const g = num(await env.KV.get(gk));
  if (g >= GLOBAL_DAY) return { status: 503, payload: { error: 'busy', detail: 'на сегодня общий лимит ии исчерпан, попробуй завтра' } };
  q[kind]++;
  await Promise.all([env.KV.put(qk, JSON.stringify(q), { expirationTtl: 172800 }), env.KV.put(gk, String(g + 1), { expirationTtl: 172800 })]);
  // если запрос к модели не удался, попытку возвращаем
  const refund = async () => { try { q[kind] = Math.max(0, q[kind] - 1); await env.KV.put(qk, JSON.stringify(q), { expirationTtl: 172800 }); } catch (e) { /* не страшно */ } };
  return { info: info, refund: refund };
}

/* ---------- аккаунты (база D1, привязка DB) ---------- */

let schemaReady = false;
async function dbInit(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, login TEXT NOT NULL UNIQUE, name TEXT, salt TEXT NOT NULL, hash TEXT NOT NULL, pro_until INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created INTEGER NOT NULL, last INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS data (user_id INTEGER PRIMARY KEY, json TEXT NOT NULL, updated INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS codes (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, days INTEGER NOT NULL, at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)')
  ]);
  for (const col of ['device TEXT', 'place TEXT']) {
    try { await env.DB.prepare('ALTER TABLE sessions ADD COLUMN ' + col).run(); } catch (e) { /* колонка уже есть */ }
  }
  schemaReady = true;
}

const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array((s.match(/../g) || []).map((x) => parseInt(x, 16)));

// пароль: pbkdf2-sha256, 100 000 кругов (максимум, который разрешает воркер), своя соль у каждого
async function hashPassword(pass, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: 100000 }, key, 256));
}
function sameHex(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const randHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const cleanLogin = (s) => String(s || '').trim().toLowerCase();
const LOGIN_RE = /^[a-z0-9_.]{3,24}$/;
const LIFE_MS = 20 * 365 * 86400000;

const userInfo = (u) => ({ id: u.id, login: u.login, name: u.name || '', pro_until: u.pro_until || 0, life: (u.pro_until || 0) - Date.now() > LIFE_MS });

// токен лежит у человека, в базе только его sha-256
function deviceOf(req) {
  const ua = req.headers.get('User-Agent') || '';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /YaBrowser/.test(ua) ? 'Yandex' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? (os === 'iOS' ? 'Mobile Safari' : 'Safari') : 'Браузер';
  return (br + (os ? ' (' + os + ')' : '')).slice(0, 40);
}
function placeOf(req) {
  const cf = req.cf || {};
  return [cf.city, cf.region, cf.country].filter(Boolean).join(', ').slice(0, 60);
}

// токен лежит у человека, в базе только его sha-256
async function startSession(env, userId, req) {
  const token = randHex(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token, user_id, created, last, device, place) VALUES (?, ?, ?, ?, ?, ?)').bind(await sha256hex(token), userId, now, now, req ? deviceOf(req) : '', req ? placeOf(req) : '').run();
  return token;
}

async function authUser(req, env) {
  if (!env.DB) return null;
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('Authorization') || '');
  if (!m) return null;
  await dbInit(env);
  const th = await sha256hex(m[1]);
  const row = await env.DB.prepare('SELECT u.id, u.login, u.name, u.pro_until, s.last AS last FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').bind(th).first();
  if (!row) return null;
  row.th = th;
  if (Date.now() - row.last > 600000) { try { await env.DB.prepare('UPDATE sessions SET last = ? WHERE token = ?').bind(Date.now(), th).run(); } catch (e) { /* не страшно */ } }
  return row;
}

// ограничитель: не больше max событий за окно (ключи живут в KV)
async function hit(env, key, max, ttl) {
  if (!env.KV) return true;
  const n = num(await env.KV.get(key));
  if (n >= max) return false;
  await env.KV.put(key, String(n + 1), { expirationTtl: ttl });
  return true;
}

async function authRoute(req, env, path, origin) {
  if (!env.DB) return reply(503, { error: 'no db', detail: 'в воркере не привязана база D1 (переменная DB)' }, origin);
  await dbInit(env);
  const ip = req.headers.get('CF-Connecting-IP') || 'x';
  const day = dayKey(env);

  if (path === '/data/get' && req.method === 'GET') {
    const u = await authUser(req, env);
    if (!u) return reply(401, { error: 'auth' }, origin);
    const row = await env.DB.prepare('SELECT json, updated FROM data WHERE user_id = ?').bind(u.id).first();
    return reply(200, row ? { json: row.json, updated: row.updated } : { json: null, updated: 0 }, origin);
  }
  if (req.method !== 'POST') return reply(405, { error: 'method' }, origin);
  const raw = await req.text();
  if (raw.length > 1000000) return reply(413, { error: 'too big' }, origin);
  let b;
  try { b = JSON.parse(raw); } catch (e) { return reply(400, { error: 'json' }, origin); }

  if (path === '/auth/register') {
    const login = cleanLogin(b.login), pass = String(b.password || ''), name = String(b.name || '').trim().slice(0, 24);
    if (!LOGIN_RE.test(login)) return reply(400, { error: 'login', detail: 'логин: 3–24 символа, латиница, цифры, точка и подчёркивание' }, origin);
    if (pass.length < 6 || pass.length > 100) return reply(400, { error: 'password', detail: 'пароль: от 6 символов' }, origin);
    if (!(await hit(env, 'reg:' + ip + ':' + day, 5, 172800))) return reply(429, { error: 'rate', detail: 'с этого адреса сегодня уже много регистраций, попробуй завтра' }, origin);
    const salt = randHex(16);
    const hash = await hashPassword(pass, salt);
    try {
      const r = await env.DB.prepare('INSERT INTO users (login, name, salt, hash, pro_until, created) VALUES (?, ?, ?, ?, 0, ?)').bind(login, name, salt, hash, Date.now()).run();
      const id = r.meta.last_row_id;
      const token = await startSession(env, id, req);
      return reply(200, { token: token, user: userInfo({ id: id, login: login, name: name, pro_until: 0 }), hasData: false }, origin);
    } catch (e) {
      if (/UNIQUE/i.test(String(e.message || e))) return reply(409, { error: 'taken', detail: 'такой логин уже занят' }, origin);
      throw e;
    }
  }

  if (path === '/auth/login') {
    const login = cleanLogin(b.login), pass = String(b.password || '');
    if (!LOGIN_RE.test(login) || !pass) return reply(400, { error: 'login', detail: 'введи логин и пароль' }, origin);
    const hour = new Date().toISOString().slice(0, 13);
    const fk = 'lg:' + login + ':' + hour;
    if (env.KV && num(await env.KV.get(fk)) >= 10) return reply(429, { error: 'rate', detail: 'слишком много неудачных попыток, попробуй через час' }, origin);
    const u = await env.DB.prepare('SELECT id, login, name, salt, hash, pro_until FROM users WHERE login = ?').bind(login).first();
    const ok = u ? sameHex(await hashPassword(pass, u.salt), u.hash) : (await hashPassword(pass, '00'.repeat(16)), false);
    if (!ok) {
      if (env.KV) await env.KV.put(fk, String(num(await env.KV.get(fk)) + 1), { expirationTtl: 3600 });
      return reply(401, { error: 'bad', detail: 'неверный логин или пароль' }, origin);
    }
    const token = await startSession(env, u.id, req);
    const has = await env.DB.prepare('SELECT updated FROM data WHERE user_id = ?').bind(u.id).first();
    return reply(200, { token: token, user: userInfo(u), hasData: !!has }, origin);
  }

  const u = await authUser(req, env);
  if (!u) return reply(401, { error: 'auth' }, origin);

  if (path === '/auth/me') return reply(200, { user: userInfo(u) }, origin);

  // активные входы: список, завершение одного, всех остальных, всех сразу
  if (path === '/auth/sessions') {
    const rs = await env.DB.prepare('SELECT token, device, place, created, last FROM sessions WHERE user_id = ? ORDER BY last DESC LIMIT 50').bind(u.id).all();
    return reply(200, { sessions: (rs.results || []).map((s) => ({ id: s.token.slice(0, 16), device: s.device || 'Устройство', place: s.place || '', created: s.created, last: s.last, current: s.token === u.th })) }, origin);
  }
  if (path === '/auth/session-end') {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND substr(token, 1, 16) = ? AND token != ?').bind(u.id, String(b.id || ''), u.th).run();
    return reply(200, { ok: true }, origin);
  }
  if (path === '/auth/sessions-end-others') {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').bind(u.id, u.th).run();
    return reply(200, { ok: true }, origin);
  }
  if (path === '/auth/logout-all') {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id).run();
    return reply(200, { ok: true }, origin);
  }

  if (path === '/auth/logout') {
    const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('Authorization') || '');
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256hex(m[1])).run();
    return reply(200, { ok: true }, origin);
  }

  if (path === '/auth/password') {
    const full = await env.DB.prepare('SELECT salt, hash FROM users WHERE id = ?').bind(u.id).first();
    const np = String(b.newPassword || '');
    if (np.length < 6 || np.length > 100) return reply(400, { error: 'password', detail: 'новый пароль: от 6 символов' }, origin);
    if (!sameHex(await hashPassword(String(b.password || ''), full.salt), full.hash)) return reply(401, { error: 'bad', detail: 'старый пароль неверный' }, origin);
    const salt = randHex(16);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET salt = ?, hash = ? WHERE id = ?').bind(salt, await hashPassword(np, salt), u.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').bind(u.id, await sha256hex(/^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('Authorization'))[1]))
    ]);
    return reply(200, { ok: true }, origin);
  }

  if (path === '/auth/delete') {
    const full = await env.DB.prepare('SELECT salt, hash FROM users WHERE id = ?').bind(u.id).first();
    if (!sameHex(await hashPassword(String(b.password || ''), full.salt), full.hash)) return reply(401, { error: 'bad', detail: 'пароль неверный' }, origin);
    // коды активации остаются «использованными», чтобы их нельзя было применить снова
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
      env.DB.prepare('DELETE FROM data WHERE user_id = ?').bind(u.id),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id)
    ]);
    return reply(200, { ok: true }, origin);
  }

  if (path === '/auth/name') {
    await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(String(b.name || '').trim().slice(0, 24), u.id).run();
    return reply(200, { ok: true }, origin);
  }

  // данные приложения целиком одним документом. base — метка, с которой телефон последний раз синхронизировался
  if (path === '/data/put') {
    const json = String(b.json || '');
    if (json.length < 2 || json.length > 900000) return reply(413, { error: 'size', detail: 'данных слишком много для облака' }, origin);
    try { JSON.parse(json); } catch (e) { return reply(400, { error: 'json' }, origin); }
    const cur = await env.DB.prepare('SELECT updated FROM data WHERE user_id = ?').bind(u.id).first();
    const base = Number(b.base) || 0;
    if (cur && cur.updated !== base && !b.force) {
      const full = await env.DB.prepare('SELECT json, updated FROM data WHERE user_id = ?').bind(u.id).first();
      return reply(409, { error: 'conflict', json: full.json, updated: full.updated }, origin);
    }
    const now = Math.max(Date.now(), (cur ? cur.updated : 0) + 1);
    await env.DB.prepare('INSERT INTO data (user_id, json, updated) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated = excluded.updated').bind(u.id, json, now).run();
    return reply(200, { updated: now }, origin);
  }

  // активация кода: код сгорает за аккаунтом навсегда, поделиться им нельзя
  if (path === '/pro/activate') {
    const norm = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);
    if (!norm) return reply(400, { error: 'code', detail: 'введи код' }, origin);
    if (!(await hit(env, 'act:' + u.id + ':' + day, 20, 172800))) return reply(429, { error: 'rate', detail: 'слишком много попыток, попробуй завтра' }, origin);
    const hash = await sha256hex(norm);
    const list = (BUILTIN_CODES + ',' + String(env.PRO_CODES || '')).split(',').map((s) => s.trim()).filter(Boolean);
    const ent = list.map((x) => x.split(':')).find((x) => x[0] === hash);
    if (!ent) return reply(404, { error: 'code', detail: 'код не подошёл. проверь, нет ли опечатки' }, origin);
    const days = Number(ent[1]) || 31;
    const used = await env.DB.prepare('SELECT user_id FROM codes WHERE hash = ?').bind(hash).first();
    if (used) return reply(409, { error: 'used', detail: used.user_id === u.id ? 'этот код уже активирован на твоём аккаунте' : 'этот код уже использован' }, origin);
    const until = Math.max(Date.now(), u.pro_until || 0) + days * 86400000;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO codes (hash, user_id, days, at) VALUES (?, ?, ?, ?)').bind(hash, u.id, days, Date.now()),
      env.DB.prepare('UPDATE users SET pro_until = ? WHERE id = ?').bind(until, u.id)
    ]);
    return reply(200, { pro_until: until, life: until - Date.now() > LIFE_MS }, origin);
  }

  return reply(404, { error: 'route' }, origin);
}

// списывает одну попытку ии с аккаунта. возвращает { info, refund } или { status, payload }
async function takeQuota(env, user, kind) {
  if (!env.KV) return { info: null, refund: async () => {} };
  const now = Date.now();
  const life = (user.pro_until || 0) - now > LIFE_MS;
  const pro = (user.pro_until || 0) > now;
  const cap = life ? LIFE_Q : pro ? PRO_Q : FREE_Q;
  const day = dayKey(env);
  const qk = 'q:u' + user.id + ':' + day, gk = 'g:' + day;
  let q = { ask: 0, food: 0 };
  try { q = Object.assign(q, JSON.parse(await env.KV.get(qk))); } catch (e) { /* первый запрос за день */ }
  const info = () => ({ pro: life ? 'life' : pro, ask: { used: q.ask, limit: cap.ask }, food: { used: q.food, limit: cap.food } });
  if (q[kind] >= cap[kind]) return { status: 429, payload: { error: 'limit', kind: kind, quota: info() } };
  const g = num(await env.KV.get(gk));
  if (g >= GLOBAL_DAY) return { status: 503, payload: { error: 'busy', detail: 'на сегодня общий лимит ии исчерпан, попробуй завтра' } };
  q[kind]++;
  await Promise.all([env.KV.put(qk, JSON.stringify(q), { expirationTtl: 172800 }), env.KV.put(gk, String(g + 1), { expirationTtl: 172800 })]);
  // если запрос к модели не удался, попытку возвращаем
  const refund = async () => { try { q[kind] = Math.max(0, q[kind] - 1); await env.KV.put(qk, JSON.stringify(q), { expirationTtl: 172800 }); } catch (e) { /* не страшно */ } };
  return { info: info, refund: refund };
}


/* ---------- DDX AI: облачная копия чатов и привязка тарифа к аккаунту (хранится в KV) ---------- */
// готовые коды активации (по 10 на тариф, на месяц). KV имеет приоритет: запись sub:КОД или просто КОД в KV переопределяет этот список
const AI_CODES = {
 "PRO-SVJ3-E3CP-WJVE": "pro",
 "PRO-KTSZ-SCP3-LRYM": "pro",
 "PRO-R3PJ-YHHA-MU4B": "pro",
 "PRO-DGAQ-95XP-9433": "pro",
 "PRO-AHJL-7QPP-C5C6": "pro",
 "PRO-7FJM-D4A2-Y25Q": "pro",
 "PRO-JSPL-C2KJ-7QYE": "pro",
 "PRO-MV7V-HHZS-Y4SL": "pro",
 "PRO-522B-BGLC-QK9F": "pro",
 "PRO-9HY9-BMYZ-8LKZ": "pro",
 "MAX-QASU-WPJL-ERNN": "max",
 "MAX-CH7F-BZNA-2X4N": "max",
 "MAX-2J35-QZ4B-AFDR": "max",
 "MAX-3U4B-GQHH-7CS3": "max",
 "MAX-98R2-D7WJ-FKAC": "max",
 "MAX-RFGL-PDNF-U82T": "max",
 "MAX-3FEQ-FC63-STV3": "max",
 "MAX-HB6Q-8HHX-YDB3": "max",
 "MAX-JRVN-R3PA-Y76S": "max",
 "MAX-2UVK-W2UK-9JSN": "max",
 "ULTRA-Q6WF-5DRJ-YQ4F": "ultra",
 "ULTRA-UX96-SWV2-6RYN": "ultra",
 "ULTRA-9BQT-34MJ-VV2B": "ultra",
 "ULTRA-KAS2-JLRV-A6M6": "ultra",
 "ULTRA-HQBB-EAMF-F37N": "ultra",
 "ULTRA-9PRW-Z2VR-Y3RC": "ultra",
 "ULTRA-A2LW-WE9N-HL38": "ultra",
 "ULTRA-DYAE-WAAT-ZZ2K": "ultra",
 "ULTRA-FBD4-2HUD-ZU2A": "ultra",
 "ULTRA-6DQA-XNZB-83FB": "ultra"
};
async function codeInfo(env, code) {
  let raw = null;
  try { raw = JSON.parse(await env.KV.get('sub:' + code)); } catch (e) { raw = null; }
  if (!raw) { try { raw = JSON.parse(await env.KV.get(code)); } catch (e) { raw = null; } }
  if (!raw && AI_CODES[code]) raw = { plan: AI_CODES[code], period: 'month' };
  return raw;
}

const AI_SUB_CODE = (c) => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);

async function aiSubOf(env, userId) {
  let link = null;
  try { link = JSON.parse(await env.KV.get('ai:s:' + userId)); } catch (e) { link = null; }
  if (!link || !link.code) return null;
  let raw = null;
  raw = await codeInfo(env, link.code);
  if (!raw || !raw.plan) return null;
  if (raw.exp && Date.now() > Number(raw.exp)) return null;
  return { code: link.code, plan: raw.plan, period: raw.period === 'year' ? 'year' : 'month', exp: raw.exp || null };
}

async function aiRoute(req, env, path, origin) {
  if (!env.KV) return reply(503, { error: 'no kv', detail: 'в воркере нет привязки KV' }, origin);
  const u = await authUser(req, env);
  if (!u) return reply(401, { error: 'auth' }, origin);
  const dk = 'ai:d:' + u.id;
  if (path === '/ai/get' && req.method === 'GET') {
    let doc = null;
    try { doc = JSON.parse(await env.KV.get(dk)); } catch (e) { doc = null; }
    return reply(200, { json: doc ? doc.json : null, updated: doc ? doc.updated : 0, sub: await aiSubOf(env, u.id), user: userInfo(u) }, origin);
  }
  if (path === '/ai/put' && req.method === 'POST') {
    const raw = await req.text();
    if (raw.length > 1000000) return reply(413, { error: 'too big' }, origin);
    let b; try { b = JSON.parse(raw); } catch (e) { return reply(400, { error: 'json' }, origin); }
    const json = String(b.json || '');
    if (json.length < 2 || json.length > 900000) return reply(413, { error: 'size', detail: 'данных слишком много для облака' }, origin);
    try { JSON.parse(json); } catch (e) { return reply(400, { error: 'json' }, origin); }
    let cur = null;
    try { cur = JSON.parse(await env.KV.get(dk)); } catch (e) { cur = null; }
    if (cur && cur.updated !== (Number(b.base) || 0) && !b.force) return reply(409, { error: 'conflict', json: cur.json, updated: cur.updated }, origin);
    const now = Math.max(Date.now(), (cur ? cur.updated : 0) + 1);
    await env.KV.put(dk, JSON.stringify({ json: json, updated: now }));
    return reply(200, { updated: now }, origin);
  }
  return reply(404, { error: 'route' }, origin);
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || 'https://gdev49df.github.io').split(',').map((s) => s.trim());

    // чужие сайты не могут пользоваться воркером из браузера
    if (!allowed.includes(origin)) return new Response(JSON.stringify({ error: 'origin ' + origin + ' не разрешён' }), { status: 403, headers: Object.assign({ 'Content-Type': 'application/json' }, cors(origin || '*')) });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    const path = new URL(req.url).pathname;
    if (path.indexOf('/push/') === 0) {
      try { return await pushRoute(req, env, path, origin); } catch (e) { return reply(502, { error: 'push', detail: String(e.message || e).slice(0, 200) }, origin); }
    }
    if (path.indexOf('/ai/') === 0) {
      try { return await aiRoute(req, env, path, origin); } catch (e) { return reply(502, { error: 'ai', detail: String(e.message || e).slice(0, 200) }, origin); }
    }
    if (path.indexOf('/auth/') === 0 || path.indexOf('/data/') === 0 || path.indexOf('/pro/') === 0) {
      try { return await authRoute(req, env, path, origin); } catch (e) { return reply(502, { error: 'db', detail: String(e.message || e).slice(0, 200) }, origin); }
    }
    if (req.method !== 'POST') return reply(405, { error: 'method' }, origin);
    if (!env.GROQ_API_KEY) return reply(500, { error: 'no key', detail: 'в воркере нет секрета GROQ_API_KEY' }, origin);

    const raw = await req.text();
    if (raw.length > 600000) return reply(413, { error: 'too big' }, origin);
    let body;
    try { body = JSON.parse(raw); } catch (e) { return reply(400, { error: 'json' }, origin); }

    // с аккаунтом лимиты считаются на человека, без аккаунта (пока не включено REQUIRE_AUTH=1) на устройство
    const user = await authUser(req, env);
    if (!user && String(env.REQUIRE_AUTH || '') === '1') return reply(401, { error: 'auth', detail: 'нужно войти в аккаунт' }, origin);
    const quota = (k) => (user ? takeQuota(env, user, k) : takeQuotaDevice(env, body, k));

    let refund = async () => {};
    try {
      if (body.mode === 'food') {
        const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image || ''));
        if (!m) return reply(400, { error: 'image' }, origin);
        const tq = await quota('food');
        if (tq.status) return reply(tq.status, tq.payload, origin);
        refund = tq.refund;
        const text = await llm(env, list(env.MODEL_FOOD, FOOD_MODELS), FOOD_SYSTEM, [
          { type: 'text', text: 'Что на фото? Верни JSON.' },
          { type: 'image_url', image_url: { url: body.image } }
        ], 800, true);
        const j = /\{[\s\S]*\}/.exec(text);
        let out = { items: [], note: '' };
        try { out = JSON.parse(j ? j[0] : text); } catch (e) { await refund(); return reply(502, { error: 'parse' }, origin); }
        const items = (Array.isArray(out.items) ? out.items : []).slice(0, 8).map((x) => ({
          name: String(x.name || '').slice(0, 60), grams: Math.max(0, Math.round(Number(x.grams) || 0)), kcal: Math.max(0, Math.round(Number(x.kcal) || 0))
        })).filter((x) => x.name);
        return reply(200, { items: items, note: String(out.note || '').slice(0, 160), quota: tq.info ? tq.info() : null }, origin);
      }

      if (body.mode === 'ask') {
        const q = String(body.question || '').trim().slice(0, 500);
        const ctx = String(body.context || '').slice(0, 8000);
        if (!q) return reply(400, { error: 'question' }, origin);
        const tq = await quota('ask');
        if (tq.status) return reply(tq.status, tq.payload, origin);
        refund = tq.refund;
        const answer = await llm(env, list(env.MODEL_ASK, ASK_MODELS), ASK_SYSTEM, 'Данные пользователя:\n' + ctx + '\n\nВопрос: ' + q, 700, false);
        return reply(200, { answer: answer, quota: tq.info ? tq.info() : null }, origin);
      }

      // вставка 2: положи прямо перед строкой  return reply(400, { error: 'mode' }, origin);
      // если раньше вставлял старую версию этой вставки, замени её целиком на эту
      if (body.mode === 'chat' || body.mode === 'sub') {
        // лимит как у chatgpt: скользящее окно 12 часов. каждое сообщение занимает слот и освобождает его через 12 часов после отправки.
        // free 5, pro 17, max 50, ultra 135 сообщений в окне. месяц или год влияют на цену и срок подписки, не на лимит
        const PLANS = { pro: 17, max: 50, ultra: 135 };
        const FREE_DAY = Number(env.CHAT_LIMIT || 5);
        const WIN_MS = 43200000;
        const device = String(body.device || '');
        if (env.KV && !/^[A-Za-z0-9-]{16,64}$/.test(device)) return reply(400, { error: 'device' }, origin);
        const day = dayKey(env);
        // код подписки: в KV лежит ключ  sub:КОД  со значением {"plan":"pro","period":"month","exp":1893456000000}
        // period: month или year, exp: когда подписка заканчивается (мс, можно не указывать)
        let code = AI_SUB_CODE(body.code);
        // с аккаунтом тариф привязан к нему: код сгорает за первым аккаунтом и дальше работает без ввода на любом его устройстве
        if (!code && user && env.KV) { const own = await aiSubOf(env, user.id); if (own) code = own.code; }
        let sub = null, limit = FREE_DAY, usedKey = null;
        if (code) {
          if (!env.KV) return reply(403, { error: 'code' }, origin);
          let raw = null;
          raw = await codeInfo(env, code);
          if (!raw || !PLANS[raw.plan]) return reply(403, { error: 'code' }, origin);
          const owner = await env.KV.get('sub-owner:' + code);
          if (owner && (!user || String(user.id) !== owner)) return reply(403, { error: 'used', detail: 'этот код уже привязан к другому аккаунту' }, origin);
          if (!owner && user) { await env.KV.put('sub-owner:' + code, String(user.id)); await env.KV.put('ai:s:' + user.id, JSON.stringify({ code: code, at: Date.now() })); }
          if (raw.exp && Date.now() > Number(raw.exp)) return reply(403, { error: 'expired' }, origin);
          const year = raw.period === 'year';
          sub = { plan: raw.plan, period: year ? 'year' : 'month', exp: raw.exp || null };
          limit = PLANS[raw.plan];
          usedKey = 'rw:c:' + code;
        } else if (env.KV) {
          usedKey = user ? 'rw:u' + user.id : 'rw:d:' + device;
        }
        // метки времени сообщений за последние 12 часов
        let stamps = [];
        if (usedKey) { try { stamps = JSON.parse(await env.KV.get(usedKey) || '[]'); } catch (e1) { stamps = []; } }
        const nowMs = Date.now();
        stamps = (Array.isArray(stamps) ? stamps : []).filter((t) => t > nowMs - WIN_MS).sort((a, b) => a - b);
        const used = stamps.length;
        // reset: когда освободится ближайший слот, full: когда лимит восстановится полностью
        const slotAt = (arr, lim) => (arr.length >= lim ? arr[arr.length - lim] + WIN_MS : 0);
        const fullAt = (arr) => (arr.length ? arr[arr.length - 1] + WIN_MS : 0);
        if (body.mode === 'sub') {
          if (!sub) return reply(403, { error: 'code' }, origin);
          return reply(200, { plan: sub.plan, period: sub.period, exp: sub.exp, left: Math.max(0, limit - used), limit: limit, reset: slotAt(stamps, limit), full: fullAt(stamps) }, origin);
        }
        const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-20)
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .map((m) => ({
            role: m.role,
            content: m.content.slice(0, 4000),
            images: m.role === 'user' && Array.isArray(m.images) ? m.images.filter((x) => typeof x === 'string' && CHAT_IMG.test(x)).slice(0, 4) : []
          }));
        if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return reply(400, { error: 'messages' }, origin);
        // фото берём только у последнего сообщения, где они есть
        let imgAt = -1;
        msgs.forEach((m, i) => { if (m.images.length) imgAt = i; });
        const vision = imgAt >= 0;
        const out = msgs.map((m, i) => (i === imgAt
          ? { role: 'user', content: [{ type: 'text', text: m.content || 'Что на этом фото?' }].concat(m.images.map((u) => ({ type: 'image_url', image_url: { url: u } }))) }
          : { role: m.role, content: m.content }));
        let gk = null, g = 0;
        if (env.KV) {
          if (used >= limit) return reply(429, { error: 'limit', plan: sub ? sub.plan : 'free', reset: slotAt(stamps, limit), full: fullAt(stamps) }, origin);
          gk = 'g:' + day;
          g = num(await env.KV.get(gk));
          if (g >= GLOBAL_DAY) return reply(503, { error: 'busy', detail: 'на сегодня общий лимит ии исчерпан, попробуй завтра' }, origin);
        }
        // с фото нужна модель, которая видит картинки (по умолчанию те же, что для еды); можно задать MODEL_VISION
        const models = vision ? list(env.MODEL_VISION, FOOD_MODELS) : list(env.MODEL_CHAT, CHAT_MODELS);
        const answer = await chatLlm(env, models, out, String(body.instructions || '').slice(0, 2000));
        if (env.KV) await Promise.all([env.KV.put(usedKey, JSON.stringify(stamps.concat([nowMs]).slice(-300)), { expirationTtl: 50000 }), env.KV.put(gk, String(g + 1), { expirationTtl: 172800 })]);
        return reply(200, {
          answer: answer, vision: vision, left: env.KV ? Math.max(0, limit - used - 1) : undefined, limit: env.KV ? limit : undefined, reset: slotAt(stamps.concat([nowMs]), limit), full: nowMs + WIN_MS,
          plan: sub ? sub.plan : 'free', period: sub ? sub.period : 'day'
        }, origin);
      }

      return reply(400, { error: 'mode' }, origin);
    } catch (e) {
      await refund();
      return reply(502, { error: 'upstream', detail: String(e.message || e).slice(0, 220) }, origin);
    }
  },

  // cron: раз в минуту
  async scheduled(event, env, ctx) { ctx.waitUntil(runDue(env)); }
};
