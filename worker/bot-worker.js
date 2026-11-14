// Telegram-бот DDX AI: отвечает на /start красивым сообщением с видео и кнопками.
// Отдельный cloudflare worker. Переменные (Settings → Variables and Secrets):
//   BOT_TOKEN       токен бота от @BotFather (секрет)
//   WEBHOOK_SECRET  любая длинная случайная строка из латиницы и цифр (секрет)
// После деплоя один раз открой в браузере:  https://ИМЯ-ВОРКЕРА.workers.dev/setup?s=ТВОЙ_WEBHOOK_SECRET
// Это привяжет вебхук, команды, кнопку меню и описание бота.

const APP = 'https://gdev49df.github.io/ddx-ai/app/';
const VIDEO = 'https://gdev49df.github.io/ddx-ai/assets/start.mp4';
const SUPPORT = 'https://t.me/bauyrzhanov_12_';

const WELCOME =
  'DDX AI — умный ии-чат прямо в telegram.\n\n' +
  'Спроси что угодно — отвечу, объясню, напишу или переведу. Например:\n' +
  '«объясни, как работает инфляция» или «напиши вежливое письмо арендодателю».\n\n' +
  'Что умею:\n' +
  '• Отвечаю на вопросы и объясняю сложное простыми словами\n' +
  '• Пишу и правлю тексты, письма, код\n' +
  '• Ищу свежую информацию в интернете и даю ссылки на источники\n' +
  '• Помню важное о тебе и подстраиваюсь под твой стиль\n' +
  '• Две модели: быстрая и умная\n' +
  '• Чаты сохраняются и синхронизируются с сайтом\n\n' +
  'Free — 12 сообщений за 12 часов. Pro, Max и Ultra — больше лимит и приоритет.\n\n' +
  'Нажми «Открыть чат», чтобы начать.';

const KEYBOARD = {
  inline_keyboard: [
    [{ text: 'Открыть чат', web_app: { url: APP } }],
    [
      { text: 'Тарифы', web_app: { url: APP } },
      { text: 'Поддержка', url: SUPPORT }
    ]
  ]
};

async function tg(env, method, body) {
  const r = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return r.json().catch(() => ({}));
}

async function welcome(env, chatId) {
  // подпись к видео ограничена 1024 символами; если вдруг длиннее, шлём видео и текст отдельно
  if (WELCOME.length <= 1024) {
    const r = await tg(env, 'sendAnimation', { chat_id: chatId, animation: VIDEO, caption: WELCOME, reply_markup: KEYBOARD });
    if (r.ok) return;
  }
  await tg(env, 'sendMessage', { chat_id: chatId, text: WELCOME, reply_markup: KEYBOARD, disable_web_page_preview: true });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // разовая настройка бота
    if (url.pathname === '/setup') {
      if (!env.WEBHOOK_SECRET || url.searchParams.get('s') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      const hook = url.origin + '/hook';
      const out = {};
      out.webhook = await tg(env, 'setWebhook', { url: hook, secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message'] });
      out.commands = await tg(env, 'setMyCommands', { commands: [{ command: 'start', description: 'открыть чат' }, { command: 'help', description: 'что умеет бот' }] });
      out.menu = await tg(env, 'setChatMenuButton', { menu_button: { type: 'web_app', text: 'Открыть чат', web_app: { url: APP } } });
      out.about = await tg(env, 'setMyShortDescription', { short_description: 'умный ии-чат: вопросы, тексты, код и поиск в интернете' });
      out.desc = await tg(env, 'setMyDescription', { description: WELCOME.split('\n\nНажми')[0].slice(0, 500) });
      return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/hook' && req.method === 'POST') {
      if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      let up; try { up = await req.json(); } catch (e) { return new Response('ok'); }
      const m = up && up.message;
      if (m && m.chat && m.chat.type === 'private') {
        const text = String(m.text || '').trim();
        if (/^\/(start|help)(@\w+)?(\s|$)/i.test(text)) await welcome(env, m.chat.id);
        else await tg(env, 'sendMessage', { chat_id: m.chat.id, text: 'Чат открывается кнопкой ниже, там я отвечаю на любые вопросы.', reply_markup: { inline_keyboard: [[{ text: 'Открыть чат', web_app: { url: APP } }]] } });
      }
      return new Response('ok');
    }
    return new Response('DDX AI bot');
  }
};
