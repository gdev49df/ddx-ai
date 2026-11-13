      // вставка 2: положи прямо перед строкой  return reply(400, { error: 'mode' }, origin);
      // если раньше вставлял старую версию этой вставки, замени её целиком на эту
      if (body.mode === 'chat' || body.mode === 'sub') {
        // тарифы: лимит сообщений в месяц; у годовой подписки лимит в 10 раз больше и считается на весь год
        const PLANS = { pro: 300, max: 1500, ultra: 5000 };
        const FREE_DAY = Number(env.CHAT_LIMIT || 20);
        const device = String(body.device || '');
        if (env.KV && !/^[A-Za-z0-9-]{16,64}$/.test(device)) return reply(400, { error: 'device' }, origin);
        const day = dayKey(env);
        // код подписки: в KV лежит ключ  sub:КОД  со значением {"plan":"pro","period":"month","exp":1893456000000}
        // period: month или year, exp: когда подписка заканчивается (мс, можно не указывать)
        const code = String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
        let sub = null, limit = FREE_DAY, usedKey = null;
        if (code) {
          if (!env.KV) return reply(403, { error: 'code' }, origin);
          let raw = null;
          try { raw = JSON.parse(await env.KV.get('sub:' + code)); } catch (e0) { raw = null; }
          if (!raw || !PLANS[raw.plan]) return reply(403, { error: 'code' }, origin);
          if (raw.exp && Date.now() > Number(raw.exp)) return reply(403, { error: 'expired' }, origin);
          const year = raw.period === 'year';
          sub = { plan: raw.plan, period: year ? 'year' : 'month', exp: raw.exp || null };
          limit = PLANS[raw.plan] * (year ? 10 : 1);
          usedKey = year ? 'u:' + code : 'u:' + code + ':' + day.slice(0, 7);
        } else if (env.KV) {
          usedKey = 'c:' + device + ':' + day;
        }
        const used = usedKey ? num(await env.KV.get(usedKey)) : 0;
        const ttl = sub && sub.period === 'year' ? 34000000 : 3000000;
        if (body.mode === 'sub') {
          if (!sub) return reply(403, { error: 'code' }, origin);
          return reply(200, { plan: sub.plan, period: sub.period, exp: sub.exp, left: Math.max(0, limit - used), limit: limit }, origin);
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
          if (used >= limit) return reply(429, { error: 'limit', plan: sub ? sub.plan : 'free' }, origin);
          gk = 'g:' + day;
          g = num(await env.KV.get(gk));
          if (g >= GLOBAL_DAY) return reply(503, { error: 'busy', detail: 'на сегодня общий лимит ии исчерпан, попробуй завтра' }, origin);
        }
        // с фото нужна модель, которая видит картинки (по умолчанию те же, что для еды); можно задать MODEL_VISION
        const models = vision ? list(env.MODEL_VISION, FOOD_MODELS) : list(env.MODEL_CHAT, CHAT_MODELS);
        const answer = await chatLlm(env, models, out, String(body.instructions || '').slice(0, 2000));
        if (env.KV) await Promise.all([env.KV.put(usedKey, String(used + 1), { expirationTtl: sub ? ttl : 172800 }), env.KV.put(gk, String(g + 1), { expirationTtl: 172800 })]);
        return reply(200, {
          answer: answer, vision: vision, left: env.KV ? Math.max(0, limit - used - 1) : undefined, limit: env.KV ? limit : undefined,
          plan: sub ? sub.plan : 'free', period: sub ? sub.period : 'day'
        }, origin);
      }
