      // вставка 2: положи прямо перед строкой  return reply(400, { error: 'mode' }, origin);
      if (body.mode === 'chat') {
        const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-20)
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
        if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return reply(400, { error: 'messages' }, origin);
        let usedKey = null, used = 0, gk = null, g = 0;
        if (env.KV) {
          const device = String(body.device || '');
          if (!/^[A-Za-z0-9-]{16,64}$/.test(device)) return reply(400, { error: 'device' }, origin);
          const day = dayKey(env);
          usedKey = 'c:' + device + ':' + day; gk = 'g:' + day;
          used = num(await env.KV.get(usedKey));
          if (used >= Number(env.CHAT_LIMIT || 50)) return reply(429, { error: 'limit' }, origin);
          g = num(await env.KV.get(gk));
          if (g >= GLOBAL_DAY) return reply(503, { error: 'busy', detail: 'на сегодня общий лимит ии исчерпан, попробуй завтра' }, origin);
        }
        const answer = await chatLlm(env, list(env.MODEL_CHAT, CHAT_MODELS), msgs);
        if (env.KV) await Promise.all([env.KV.put(usedKey, String(used + 1), { expirationTtl: 172800 }), env.KV.put(gk, String(g + 1), { expirationTtl: 172800 })]);
        return reply(200, { answer: answer }, origin);
      }

