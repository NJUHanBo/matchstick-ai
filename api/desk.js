export const config = {
  runtime: 'edge',
  maxDuration: 60,
};

const PARATERA_URL = 'https://llmapi.paratera.com/v1/chat/completions';
const SUPABASE_URL = 'https://ccepjmfhlanlwgowwxqu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjZXBqbWZobGFubHdnb3d3eHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDc5NzksImV4cCI6MjA5NzE4Mzk3OX0.3X5JVXwqGJDDkDuQvc9rnM2CVP6x9O6PYMTTUnu9aXo';

const MODELS = new Set([
  'GLM-5.3-FlashX',
  'GLM-5.3',
  'GLM-5.3-Flash',
  'GLM-4.5-AirX',
  'Qwen3.8-Max',
  'Qwen3.8-Flash',
  'MiniMax-M3',
  'DeepSeek-V4.1-Flash',
  'DeepSeek-V4-Pro-0813',
  'Kimi-K3',
  'Claude-Fable-5.1',
  'GPT-6-Astra',
  'Claude-Opus-4.6',
]);

const QUICK_DEFAULT_SYSTEM =
  '你是韩博随身书案的速查助手。回答准确、平实、干净，用规范现代汉语说明文，' +
  '跳过客套铺垫，优先交代具体时间、机构名称、核心事实与来龙去脉；' +
  '不用互联网黑话，不用“不是X而是Y”对仗句式；拿不准或检索未覆盖的细节明说未知，不编造。';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Desk-Token',
};

function jsonResp(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

function getKeyPool() {
  const raw = [process.env.PARATERA_API_KEYS || '', process.env.PARATERA_API_KEY || ''].join('\n');
  const keys = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('sk-'));
  return [...new Set(keys)];
}

function normalizeEffort(model, effort) {
  if (!effort || effort === 'off') return null;
  if (model.startsWith('GLM-5')) {
    if (effort === 'xhigh') return 'max';
    return ['low', 'high', 'max'].includes(effort) ? effort : 'low';
  }
  if (model.includes('Fable') || model.includes('Opus')) {
    if (effort === 'xhigh') return 'max';
    return ['low', 'high', 'max'].includes(effort) ? effort : 'high';
  }
  if (model.includes('Astra')) {
    return ['low', 'high', 'max', 'xhigh'].includes(effort) ? effort : 'high';
  }
  return null;
}

function beijingNow() {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return {
    date: `${y}-${m}-${d}`,
    ym: `${y}年${m}月`,
    ts: `${y}-${m}-${d} ${hh}:${mm}`,
    id: `${y}${m}${d}-${hh}${mm}${ss}`,
  };
}

function decodeHtml(str) {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRssItems(xml, limit = 6) {
  const out = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null && out.length < limit) {
    const block = m[1];
    const titleM = block.match(/<title>([\s\S]*?)<\/title>/i);
    const linkM = block.match(/<link>([\s\S]*?)<\/link>/i);
    const descM = block.match(/<description>([\s\S]*?)<\/description>/i);
    const pubM = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const title = decodeHtml(titleM ? titleM[1] : '');
    const url = decodeHtml(linkM ? linkM[1] : '');
    const desc = decodeHtml(descM ? descM[1] : '').slice(0, 220);
    const pub = decodeHtml(pubM ? pubM[1] : '');
    if (title && url) {
      out.push({
        title,
        url,
        snippet: pub ? `${pub.slice(0, 22)} · ${desc || title}` : desc || title,
      });
    }
  }
  return out;
}

async function fetchGoogleNews(q) {
  const url =
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent(q) +
    '&hl=zh-CN&gl=CN&ceid=CN:zh-Hans';
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) return [];
  return parseRssItems(await r.text(), 6);
}

async function fetchBingNews(q) {
  const url =
    'https://www.bing.com/news/search?q=' + encodeURIComponent(q) + '&format=rss&mkt=zh-CN';
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) return [];
  return parseRssItems(await r.text(), 5);
}

async function fetchSo360(q) {
  const url = 'https://www.so.com/s?q=' + encodeURIComponent(q) + '&adv_t=m';
  const r = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) return [];
  const raw = await r.text();
  const out = [];
  const liRe = /<li[^>]*class="res-list[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(raw)) !== null && out.length < 5) {
    const block = m[1];
    const aM = block.match(/<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!aM) continue;
    const mdM = block.match(/data-mdurl="([^"]+)"/i);
    const href = decodeHtml(mdM ? mdM[1] : aM[1]);
    const title = decodeHtml(aM[2]);
    if (!title || title.includes('_360图片') || title.includes('_360视频')) continue;
    const stripped = block
      .replace(/<h3[^>]*>[\s\S]*?<\/h3>/gi, '')
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
    const snippet = decodeHtml(stripped).slice(0, 220);
    if (snippet) out.push({ title, url: href, snippet });
  }
  return out;
}

async function liveWebSearch(userQuery) {
  const q = String(userQuery || '').trim();
  const bj = beijingNow();
  let core = q
    .replace(
      /(最近|近期|好像|似乎|听说|请问|随便|帮我|了解下|了解一下|讲讲|说说|是什么情况|什么情况|怎么回事|啥情况|正在开|在开|有个|有什么)/g,
      ' ',
    )
    .replace(/[，。？！、,.?!：:；;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!core) core = q;
  if (/(开会|开的会|国家级的会|国际会议|峰会)/.test(q) && !core.includes('会议')) {
    core = `${core} 会议 峰会`;
  }
  const datedQ = core.includes(bj.date.slice(0, 4)) ? core : `${core} ${bj.ym}`;

  const settled = await Promise.allSettled([
    fetchGoogleNews(core),
    fetchBingNews(datedQ),
    fetchSo360(core),
  ]);

  const seen = new Set();
  const merged = [];
  for (const res of settled) {
    if (res.status !== 'fulfilled') continue;
    for (const it of res.value) {
      const k = (it.url || '').split('?')[0] || it.title;
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(it);
      }
      if (merged.length >= 8) return merged;
    }
  }
  return merged;
}

async function callParatera(body, keys, stream = true) {
  const start = Math.floor(Math.random() * keys.length);
  let lastResp = null;
  const maxTries = Math.min(keys.length, 3);
  for (let i = 0; i < maxTries; i++) {
    const key = keys[(start + i) % keys.length];
    const resp = await fetch(PARATERA_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, stream }),
    });
    if (resp.ok) return resp;
    lastResp = resp;
    if (![401, 403, 429].includes(resp.status)) break;
  }
  return lastResp;
}

async function supabaseRpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

function extractJsonObj(raw) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return jsonResp(405, { error: 'Method not allowed' });
  }

  const expectedPwd = (process.env.DESK_PASSWORD || '').trim();

  let payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResp(400, { error: '请求体 JSON 格式错误' });
  }

  const token = (req.headers.get('x-desk-token') || payload.token || '').trim();
  if (expectedPwd && token !== expectedPwd) {
    return jsonResp(401, { error: '访问口令不正确' });
  }

  const action = payload.action || 'chat';

  if (action === 'verify') {
    const sb = await supabaseRpc('desk_list_clippings', { p_pwd: token, p_query: '', p_limit: 1 });
    return jsonResp(200, {
      ok: true,
      auth_required: Boolean(expectedPwd),
      supabase_ready: sb.ok,
      keys_count: getKeyPool().length,
    });
  }

  if (action === 'notes_list') {
    const sb = await supabaseRpc('desk_list_clippings', {
      p_pwd: token,
      p_query: String(payload.query || ''),
      p_limit: 80,
    });
    if (!sb.ok) {
      return jsonResp(200, { ok: false, supabase_ready: false, notes: [], detail: sb.data?.message || '' });
    }
    return jsonResp(200, { ok: true, supabase_ready: true, notes: Array.isArray(sb.data) ? sb.data : [] });
  }

  if (action === 'note_delete') {
    const id = String(payload.id || '').trim();
    if (!id) return jsonResp(400, { error: '缺少笔记 id' });
    const sb = await supabaseRpc('desk_delete_clipping', { p_pwd: token, p_id: id });
    return sb.ok ? jsonResp(200, { ok: true }) : jsonResp(502, { error: sb.data?.message || '删除失败' });
  }

  const keys = getKeyPool();
  if (!keys.length) {
    return jsonResp(500, { error: '服务端尚未配置 PARATERA_API_KEYS 环境变量' });
  }

  if (action === 'note_save') {
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    if (!messages.length) return jsonResp(400, { error: '还没有可保存的问答内容' });
    const userNote = String(payload.user_note || '').trim();
    const mode = payload.mode === 'raw' ? 'raw' : 'distill';
    const sources = Array.isArray(payload.sources) ? payload.sources.slice(0, 4) : [];
    const bj = beijingNow();

    let title = '';
    let tags = [];
    let bullets = [];
    let rawBody = '';

    if (mode === 'distill') {
      const transcript = messages
        .slice(-8)
        .map((m) => `【${m.role === 'user' ? '问' : '答'}】${String(m.content || '').trim()}`)
        .join('\n\n')
        .slice(0, 6000);
      const distillPrompt =
        `当前时间：${bj.ts}。\n` +
        '请把下面这段随手问答整理成一张精炼的留底知识卡，只输出合法 JSON 对象，字段如下：\n' +
        '{"title": "不超过22字的准确标题", "tags": ["2到4个简短中文标签，不带#"], ' +
        '"bullets": ["2到4条最值得留底的具体事实、数字、时间或核心机制，每条完整简练"]}\n\n' +
        `用户顺手批注：${userNote || '（无）'}\n\n问答内容：\n${transcript}`;

      const resp = await callParatera(
        {
          model: 'GLM-5.3-FlashX',
          messages: [
            { role: 'system', content: '只输出合法JSON，不要任何解释文字。' },
            { role: 'user', content: distillPrompt },
          ],
          reasoning_effort: 'low',
          max_tokens: 900,
        },
        keys,
        false,
      );
      if (resp && resp.ok) {
        const resJson = await resp.json().catch(() => null);
        const content = resJson?.choices?.[0]?.message?.content || '';
        const parsed = extractJsonObj(content);
        if (parsed) {
          title = String(parsed.title || '').trim();
          tags = (Array.isArray(parsed.tags) ? parsed.tags : [])
            .map((t) => String(t).trim().replace(/^#/, ''))
            .filter(Boolean)
            .slice(0, 5);
          bullets = (Array.isArray(parsed.bullets) ? parsed.bullets : [])
            .map((b) => String(b).trim())
            .filter(Boolean);
        }
      }
    }

    if (!title) {
      const firstQ = messages.find((m) => m.role === 'user')?.content || '随手留底';
      title = String(firstQ).replace(/\s+/g, ' ').trim().slice(0, 24) || '随手留底';
    }
    if (!bullets.length) {
      const lastA = [...messages].reverse().find((m) => m.role === 'assistant')?.content || '';
      rawBody = String(lastA).trim();
    }

    const record = {
      id: bj.id,
      timestamp: bj.ts,
      title,
      tags,
      bullets,
      raw_body: rawBody,
      user_note: userNote,
      sources,
      origin: 'web',
    };

    const sb = await supabaseRpc('desk_upsert_clipping', { p_pwd: token, p_item: record });
    return jsonResp(200, {
      ok: true,
      cloud_saved: sb.ok,
      cloud_error: sb.ok ? '' : sb.data?.message || 'Supabase 尚未初始化',
      record,
    });
  }

  // 默认 action === 'chat'：流式 SSE 速查
  const model = MODELS.has(payload.model) ? payload.model : 'GLM-5.3-FlashX';
  const effort = String(payload.effort || 'low');
  const useSearch = payload.web_search !== false;
  const systemHint = String(payload.system_hint || '').trim();
  const cleanMsgs = (Array.isArray(payload.messages) ? payload.messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .map((m) => ({ role: m.role, content: String(m.content).trim() }));

  if (!cleanMsgs.length || cleanMsgs[cleanMsgs.length - 1].role !== 'user') {
    return jsonResp(400, { error: '请输入问题' });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      const t0 = Date.now();
      try {
        const bj = beijingNow();
        const sysParts = [`当前真实北京时间：${bj.ts}。`, QUICK_DEFAULT_SYSTEM];
        if (systemHint) sysParts.push(systemHint);

        let sources = [];
        if (useSearch) {
          const searchQ = String(payload.search_query || cleanMsgs[cleanMsgs.length - 1].content).trim();
          sources = await liveWebSearch(searchQ);
          emit({
            type: 'sources',
            sources,
            search_seconds: Number(((Date.now() - t0) / 1000).toFixed(2)),
          });
          if (sources.length) {
            const ctx = [
              '以下是实时检索到的网页与新闻摘要，回答时可直接参考并用 [1][2] 标注关键出处：',
              ...sources.map((s, idx) => `[${idx + 1}] 标题：${s.title}\n    摘要：${s.snippet}\n    链接：${s.url}`),
            ];
            sysParts.push(ctx.join('\n'));
          }
        }

        const normEff = normalizeEffort(model, effort);
        const maxTokens = Math.max(256, Math.min(Number(payload.max_tokens) || 4096, 32000));
        const body = {
          model,
          messages: [{ role: 'system', content: sysParts.join('\n\n') }, ...cleanMsgs.slice(-12)],
          max_tokens: maxTokens,
        };
        if (normEff) body.reasoning_effort = normEff;

        emit({ type: 'meta', model, effort: normEff || 'off', sources_count: sources.length });

        const upstream = await callParatera(body, keys, true);
        if (!upstream || !upstream.ok || !upstream.body) {
          const detail = upstream ? (await upstream.text().catch(() => '')).slice(0, 400) : '无响应';
          emit({ type: 'error', error: `上游接口错误 ${upstream?.status || ''}: ${detail}` });
          controller.close();
          return;
        }

        const reader = upstream.body.getReader();
        let buf = '';
        let charsOut = 0;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;
            try {
              const chunk = JSON.parse(dataStr);
              const choice = chunk?.choices?.[0] || {};
              const delta = choice.delta || {};
              const text = delta.content || '';
              const reasoning = delta.reasoning_content || delta.reasoning || '';
              const ev = { type: 'delta' };
              if (text) {
                charsOut += text.length;
                ev.text = text;
              }
              if (reasoning) ev.reasoning = reasoning;
              if (choice.finish_reason) ev.finish_reason = choice.finish_reason;
              if (ev.text || ev.reasoning || ev.finish_reason) emit(ev);
            } catch {
              // ignore partial SSE json
            }
          }
        }

        emit({
          type: 'done',
          chars_out: charsOut,
          seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
        });
      } catch (err) {
        emit({ type: 'error', error: String(err?.message || err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      ...CORS,
    },
  });
}
