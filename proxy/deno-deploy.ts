// СНР OS: прокси для ИИ-вступлений на Deno Deploy.
// Переменные окружения задаются в настройках проекта: ALLOWED_ORIGIN, LLM_BASE_URL, LLM_MODEL, OPENAI_API_KEY.
const env = (k: string) => Deno.env.get(k) ?? '';
const MAX_BODY = 4096;
const BLOCKED = /диагноз|лечени|лечит|вылеч|излеч|лекарств|таблетк|препарат/i;
const SYSTEM = 'Ты составляешь короткое вступление к 3-минутной сессии тренировки спокойствия. ' +
  'Верни только JSON вида {"title": "...", "intro": ["...", "..."]}. Заголовок до 60 символов, ' +
  'от 2 до 4 коротких фраз на русском, спокойный тон. Не ставь диагнозов, не упоминай болезни, ' +
  'лекарства и лечение, не обещай результатов.';
const PROTOS = ['shield', 'booster', 'peak', 'reset'];

function sanitize(p: any) {
  if (!p || !PROTOS.includes(p.protocol)) return null;
  if (!Number.isInteger(p.day) || p.day < 1 || p.day > 10000) return null;
  if (!Array.isArray(p.vuln) || p.vuln.length !== 3 || !p.vuln.every((v: any) => Number.isFinite(v) && v >= 0 && v <= 100)) return null;
  const recent = Array.isArray(p.recent) ? p.recent.slice(-5).map((r: any) => ({
    proto: PROTOS.includes(r?.proto) ? r.proto : null,
    delta: Number.isFinite(r?.delta) ? Math.round(r.delta) : null,
    disc: Number.isFinite(r?.disc) ? r.disc : null,
  })) : [];
  return { protocol: p.protocol, day: p.day, vuln: p.vuln.map(Math.round), recent };
}

function clean(out: any) {
  if (!out || typeof out.title !== 'string' || !Array.isArray(out.intro)) return null;
  const title = out.title.slice(0, 60);
  const intro = out.intro.filter((x: any) => typeof x === 'string').slice(0, 4).map((x: string) => x.slice(0, 200));
  if (!intro.length || BLOCKED.test(title + intro.join(' '))) return null;
  return { title, intro };
}

Deno.serve(async (req: Request) => {
  const origin = env('ALLOWED_ORIGIN');
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  const json = (obj: unknown, status: number) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (req.headers.get('Origin') !== origin) return json({ error: 'origin' }, 403);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'too large' }, 413);
  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: 'json' }, 400); }
  const prof = sanitize(body);
  if (!prof) return json({ error: 'profile' }, 400);

  const base = (env('LLM_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, '');
  const up = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env('OPENAI_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env('LLM_MODEL') || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 300,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(prof) }],
    }),
  });
  if (!up.ok) return json({ error: 'upstream' }, 502);

  let out: any;
  try { out = JSON.parse((await up.json()).choices[0].message.content); }
  catch { return json({ error: 'model output' }, 502); }
  const safe = clean(out);
  if (!safe) return json({ error: 'invalid' }, 502);
  return json(safe, 200);
});
