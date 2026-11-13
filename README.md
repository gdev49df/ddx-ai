# ddx-ai

w chat: простой ии-чат (pwa) на воркере ddx-ai (groq).

- `app/`: сам чат. работает через воркер `ddx-ai.wsmp.workers.dev`, режим `chat`
- `worker/chat-patch-1.js` и `worker/chat-patch-2.js`: две вставки в код воркера ddx-ai, добавляют режим `chat`
- переменные воркера (необязательно): `CHAT_SYSTEM` (характер ии), `MODEL_CHAT` (модели через запятую), `CHAT_LIMIT` (запросов в день на устройство, по умолчанию 50)

Создано @bauyrzhanov_12_
