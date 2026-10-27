export const config = {
  runtime: 'edge',
};

// 赏金猎人页（hunt/）的后端：只转发到 Supabase 的三个函数，规则都在 supabase-hunt.sql 里
const SUPABASE_URL = 'https://ccepjmfhlanlwgowwxqu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjZXBqbWZobGFubHdnb3d3eHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDc5NzksImV4cCI6MjA5NzE4Mzk3OX0.3X5JVXwqGJDDkDuQvc9rnM2CVP6x9O6PYMTTUnu9aXo';

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function rpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, body };
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const p = await req.json().catch(() => ({}));
  const id = str(p.id, 40);

  if (p.action === 'state') {
    const r = await rpc('hunt_state', { p_id: id });
    return r.ok ? json(200, r.body) : json(502, { error: 'db' });
  }

  if (p.action === 'register') {
    const codename = str(p.codename, 12);
    if (id.length < 8 || !codename) return json(400, { error: 'input' });
    const r = await rpc('hunt_register', { p_id: id, p_codename: codename, p_from: str(p.from, 40) || null });
    return r.ok ? json(200, r.body) : json(502, { error: 'db' });
  }

  if (p.action === 'recover') {
    const no = Number(p.no), codename = str(p.codename, 12);
    if (!Number.isInteger(no) || no < 1 || !codename) return json(400, { error: 'input' });
    const r = await rpc('hunt_recover', { p_no: no, p_codename: codename });
    if (!r.ok) return json(502, { error: 'db' });
    return r.body && r.body.id ? json(200, { id: r.body.id }) : json(404, { error: 'notfound' });
  }

  if (p.action === 'claim') {
    if (id.length < 8 || !Number.isInteger(p.monster)) return json(400, { error: 'input' });
    const r = await rpc('hunt_claim', { p_id: id, p_monster: p.monster });
    return r.ok ? json(200, { ok: true }) : json(502, { error: 'db' });
  }

  if (p.action === 'claims') {
    const r = await rpc('hunt_claims_list', { p_pwd: str(p.pwd, 64) });
    if (r.ok) return json(200, { claims: r.body });
    return json(String(r.body?.message).includes('bad_password') ? 403 : 502, { error: 'claims' });
  }

  if (p.action === 'capture') {
    const monster = Number.isInteger(p.monster) ? p.monster : null;
    const r = await rpc('hunt_capture', { p_pwd: str(p.pwd, 64), p_monster: monster, p_undo: !!p.undo });
    if (r.ok) return json(200, { captured: r.body });
    return json(String(r.body?.message).includes('bad_password') ? 403 : 502, { error: 'capture' });
  }

  return json(400, { error: 'action' });
}
