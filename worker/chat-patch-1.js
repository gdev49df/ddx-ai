// вставка 1: положи сразу после строки  const list = (v, def) => ...
const CHAT_MODELS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
const CHAT_SYSTEM = 'Ты дружелюбный ии-помощник. Отвечай по-русски, коротко и по делу, если не попросили иначе.';

async function chatLlm(env, models, messages) {
  let last = 'нет моделей';
  for (const model of models) {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + env.GROQ_API_KEY },
      body: JSON.stringify({ model: model, max_tokens: 1000, temperature: 0.6, messages: [{ role: 'system', content: env.CHAT_SYSTEM || CHAT_SYSTEM }].concat(messages) })
    });
    if (!r.ok) { last = 'groq ' + r.status + ' (' + model + ')'; if ([400, 403, 404, 429].includes(r.status)) continue; break; }
    const j = await r.json();
    const text = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (text) return text;
    last = 'пустой ответ (' + model + ')';
  }
  throw new Error(last);
}
