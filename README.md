# ddx-ai

w chat: простой ии-чат (pwa) и воркер-прокси к groq.

- `app/`: сам чат (pwa для iPhone). в `index.html` в `var API` укажи адрес воркера
- `worker/worker.js`: cloudflare-воркер. секрет `GROQ_API_KEY`, переменные `ALLOWED_ORIGINS`, `MODELS`, `SYSTEM`, `DAY_LIMIT`, необязательная привязка `KV`

Создано @bauyrzhanov_12_
