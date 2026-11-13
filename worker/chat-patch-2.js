      // вставка 2: положи прямо перед строкой  return reply(400, { error: 'mode' }, origin);
      // если раньше вставлял старую версию этой вставки, замени её целиком на эту
      if (body.mode === 'chat') {
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
        let usedKey = null, used = 0, gk = null, g = 0;
        const limit = Number(env.CHAT_LIMIT || 50);
        if (env.KV) {
          const device = String(body.device || '');
          if (!/^[A-Za-z0-9-]{16,64}$/.test(device)) return reply(400, { error: 'device' }, origin);
          const day = dayKey(env);
          usedKey = 'c:' + device + ':' + day; gk = 'g:' + day;
          used = num(await env.KV.get(usedKey));
          if (used >= limit) return reply(429, { error: 'limit' }, origin);
          g = num(await env.KV.get(gk));
          if (g >= GLOBAL_DAY) return reply(503, { error: 'busy', detail: 'на сегодня общий лимит ии исчерпан, попробуй завтра' }, origin);
        }
        // с фото нужна модель, которая видит картинки (по умолчанию те же, что для еды); можно задать MODEL_VISION
        const models = vision ? list(env.MODEL_VISION, FOOD_MODELS) : list(env.MODEL_CHAT, CHAT_MODELS);
        const answer = await chatLlm(env, models, out, String(body.instructions || '').slice(0, 2000));
        if (env.KV) await Promise.all([env.KV.put(usedKey, String(used + 1), { expirationTtl: 172800 }), env.KV.put(gk, String(g + 1), { expirationTtl: 172800 })]);
        return reply(200, { answer: answer, vision: vision, left: env.KV ? Math.max(0, limit - used - 1) : undefined, limit: env.KV ? limit : undefined }, origin);
      }
