export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = 'https://ccepjmfhlanlwgowwxqu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjZXBqbWZobGFubHdnb3d3eHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDc5NzksImV4cCI6MjA5NzE4Mzk3OX0.3X5JVXwqGJDDkDuQvc9rnM2CVP6x9O6PYMTTUnu9aXo';

const DEEPSEEK_MODEL = 'deepseek-v4-pro';
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';

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
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.NEWDEEPSEEK || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: '服务端未配置 NEWDEEPSEEK 环境变量' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { code, deviceId, systemPrompt, userPrompt } = body;
  if (!code || !deviceId || !systemPrompt || !userPrompt) {
    return new Response(JSON.stringify({ error: '缺少必要参数' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const validation = await validateActivation(String(code).trim(), deviceId);
  if (validation === 'already_bound') {
    return new Response(JSON.stringify({ error: '该激活码已绑定其他设备，请联系获取新码' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!validation) {
    return new Response(JSON.stringify({ error: '激活码无效或已过期' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const dsResponse = await fetch(DEEPSEEK_ENDPOINT, {
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
      max_tokens: 4096,
    }),
  });

  if (!dsResponse.ok) {
    const text = await dsResponse.text();
    return new Response(
      JSON.stringify({ error: `DeepSeek API 错误 ${dsResponse.status}: ${text.slice(0, 200)}` }),
      {
        status: dsResponse.status,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  return new Response(dsResponse.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
