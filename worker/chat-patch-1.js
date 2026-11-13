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
