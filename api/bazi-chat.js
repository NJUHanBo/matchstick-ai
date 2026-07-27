export const config = {
  runtime: 'edge',
  maxDuration: 60,
};

const SUPABASE_URL = 'https://ccepjmfhlanlwgowwxqu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjZXBqbWZobGFubHdnb3d3eHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDc5NzksImV4cCI6MjA5NzE4Mzk3OX0.3X5JVXwqGJDDkDuQvc9rnM2CVP6x9O6PYMTTUnu9aXo';

const DEEPSEEK_MODEL = 'deepseek-v4-pro';
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function supabaseFetch(path, options = {}) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...options.headers,
  };
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers });
}

async function validateActivation(code, deviceId) {
  const res = await supabaseFetch(
    `activation_codes?code=eq.${encodeURIComponent(code)}&is_active=eq.true&select=code,is_active,used_by`,
  );
  if (!res.ok) return false;

  const rows = await res.json();
  if (!rows?.length) return false;

  const row = rows[0];
  if (row.used_by && row.used_by !== deviceId) return 'already_bound';

  if (!row.used_by) {
    await supabaseFetch(`activation_codes?code=eq.${encodeURIComponent(code)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ used_by: deviceId }),
    });
  }

  return true;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.NEWDEEPSEEK || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return json(500, { error: '服务端未配置 NEWDEEPSEEK 环境变量' });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const { code, deviceId, systemPrompt, userPrompt } = body;
  if (!code || !deviceId || !systemPrompt || !userPrompt) {
    return json(400, { error: '缺少必要参数' });
  }

  // Cap prompt size to avoid edge timeouts / body issues
  if (String(systemPrompt).length + String(userPrompt).length > 60000) {
    return json(400, { error: '提示词过长，请缩短后重试' });
  }

  const validation = await validateActivation(String(code).trim(), deviceId);
  if (validation === 'already_bound') {
    return json(403, { error: '该激活码已绑定其他设备，请联系获取新码' });
  }
  if (!validation) {
    return json(403, { error: '激活码无效或已过期' });
  }

  let dsResponse;
  try {
    dsResponse = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: true,
        thinking: { type: 'disabled' },
        temperature: 0.7,
        max_tokens: 2500,
      }),
    });
  } catch (err) {
    return json(502, { error: `无法连接 DeepSeek：${err?.message || err}` });
  }

  if (!dsResponse.ok) {
    const text = await dsResponse.text();
    return json(dsResponse.status, {
      error: `DeepSeek API 错误 ${dsResponse.status}: ${text.slice(0, 200)}`,
    });
  }

  return new Response(dsResponse.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      ...CORS_HEADERS,
    },
  });
}
