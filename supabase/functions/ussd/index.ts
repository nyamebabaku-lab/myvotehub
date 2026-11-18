// MyVoteHub USSD gateway. Every provider's request is turned into one call to the
// database menu engine (ussd_step) and the answer is sent back in that provider's format.
//
//   https://<project>.supabase.co/functions/v1/ussd?provider=hubtel&key=<USSD_KEY>
//   provider = hubtel | arkesel | africastalking | generic
//
// The secret key stops strangers from faking votes for other phone numbers.
// Check each provider's current docs when connecting: field names below follow their published formats.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const KEY = Deno.env.get('USSD_KEY') || '';

type Step = { sessionId: string; phone: string; input: string; release?: boolean };
type Screen = { message: string; done: boolean };

async function step(s: Step): Promise<Screen> {
  if (s.release) {
    await db.from('ussd_sessions').delete().eq('id', s.sessionId);
    return { message: 'Goodbye', done: true };
  }
  const { data, error } = await db.rpc('ussd_step', { sid: s.sessionId, msisdn: s.phone, input: s.input });
  if (error || !data?.[0]) return { message: 'MyVoteHub is busy. Please try again shortly.', done: true };
  return data[0];
}

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

async function body(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) return await req.json();
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!KEY || url.searchParams.get('key') !== KEY) return new Response('Forbidden', { status: 403 });
  if (req.method !== 'POST') return new Response('MyVoteHub USSD gateway is running', { status: 200 });
  const provider = url.searchParams.get('provider') || 'generic';
  const b = await body(req);

  if (provider === 'africastalking') {
    // text holds every answer so far joined by "*"; the engine keeps its own state, so only the latest answer is needed.
    const text = b.text || '';
    const parts = text === '' ? [''] : text.split('*');
    const r = await step({ sessionId: `at:${b.sessionId}`, phone: b.phoneNumber, input: parts[parts.length - 1] });
    return new Response(`${r.done ? 'END' : 'CON'} ${r.message}`, { headers: { 'Content-Type': 'text/plain' } });
  }

  if (provider === 'arkesel') {
    const isNew = b.newSession === true || b.newSession === 'true';
    const r = await step({ sessionId: `ark:${b.sessionID}`, phone: b.msisdn, input: isNew ? '' : b.userData || '' });
    return json({ sessionID: b.sessionID, userID: b.userID, msisdn: b.msisdn, message: r.message, continueSession: !r.done });
  }

  if (provider === 'hubtel') {
    const type = String(b.Type || '').toLowerCase();
    const r = await step({ sessionId: `hub:${b.SessionId}`, phone: b.Mobile, input: type === 'initiation' ? '' : b.Message || '', release: type === 'release' || type === 'timeout' });
    return json({ SessionId: b.SessionId, Type: r.done ? 'release' : 'response', Message: r.message, Label: 'MyVoteHub', DataType: r.done ? 'display' : 'input', FieldType: 'text' });
  }

  // generic: { sessionId, phone, text } → { message, end }
  const r = await step({ sessionId: `gen:${b.sessionId}`, phone: b.phone, input: b.text || '' });
  return json({ message: r.message, end: r.done });
});
