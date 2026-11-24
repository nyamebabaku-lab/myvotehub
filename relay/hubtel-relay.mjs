// Fixed-IP relay for Hubtel. Hubtel's Receive Money, Send Money and status APIs only accept
// whitelisted server IPs, and Supabase Edge Functions have no fixed IP. Run this on any small
// server with a static IP (e.g. a GH₵60–100/month VPS), give Hubtel that IP, then set
// HUBTEL_RELAY_URL=https://<server>/relay and HUBTEL_RELAY_KEY in Supabase secrets.
//
//   RELAY_KEY=<long random secret> PORT=8080 node hubtel-relay.mjs
//
// Put it behind HTTPS (e.g. Caddy: `relay.example.com { reverse_proxy localhost:8080 }`).
// It only forwards to Hubtel hosts and only for callers that know the key. No dependencies.
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const KEY = process.env.RELAY_KEY || '';
const PORT = Number(process.env.PORT || 8080);
if (KEY.length < 24) { console.error('Set RELAY_KEY to a random secret of at least 24 characters'); process.exit(1); }
const ALLOWED = /^https:\/\/([a-z0-9-]+\.)*hubtel\.com\//i;
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

createServer(async (req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
  if (req.method === 'GET') return send(200, { ok: true, service: 'MyVoteHub Hubtel relay' });
  if (req.method !== 'POST' || !same(String(req.headers['x-relay-key'] || ''), KEY)) return send(403, { error: 'Forbidden' });
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 64_000) return send(413, { error: 'Too large' }); }
  let r;
  try { r = JSON.parse(raw); } catch { return send(400, { error: 'Bad JSON' }); }
  if (!ALLOWED.test(r.url || '')) return send(400, { error: 'Only Hubtel URLs are relayed' });
  try {
    const up = await fetch(r.url, { method: r.method || 'GET', headers: { Authorization: r.headers?.Authorization || '', 'Content-Type': 'application/json' }, body: r.method === 'POST' ? r.body : undefined, signal: AbortSignal.timeout(30_000) });
    res.writeHead(up.status, { 'Content-Type': up.headers.get('content-type') || 'application/json' });
    res.end(await up.text());
    console.log(new Date().toISOString(), r.method, new URL(r.url).pathname, up.status);
  } catch (e) {
    send(502, { error: 'Hubtel did not answer', detail: String(e.message || e) });
  }
}).listen(PORT, () => console.log(`Hubtel relay on :${PORT}`));
