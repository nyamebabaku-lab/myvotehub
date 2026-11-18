// USSD control room: a phone simulator running the real menu engine, the code voters dial,
// provider connection details, and the (simulated) SMS receipts.
import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Send, Save, Copy, MessageSquare, RadioTower, Smartphone, RefreshCw } from 'lucide-react';
import { useDB } from '../../data/store';
import { useCurrentUser } from '../../data/selectors';
import { LIVE } from '../../config';
import { supabase, must } from '../../lib/supabase';
import { refresh } from '../../data/sync';
import { fmtDateTime } from '../../lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, StatCard, cx, toast } from '../../components/ui';
import { MenuEditor, UssdEvents } from './UssdMenuEditor';

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL || 'https://<project>.supabase.co'}/functions/v1/ussd`;
const PROVIDERS = [
  ['hubtel', 'Hubtel Programmable Services'],
  ['arkesel', 'Arkesel USSD'],
  ['africastalking', "Africa's Talking"],
];

function Simulator({ onStep }) {
  const [phone, setPhone] = useState('0244123456');
  const [sid, setSid] = useState(null);
  const [screen, setScreen] = useState(null); // { message, done }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  const ussd = useDB((s) => s.settings.ussdCode) || '*XXX*YY#';

  const send = async (text, session = sid) => {
    setBusy(true);
    try {
      const [r] = must(await supabase.rpc('ussd_simulate', { sid: session, msisdn: phone, input: text }));
      setScreen(r);
      setInput('');
      onStep?.();
    } catch (e) {
      toast.error('Simulator error', e.message);
    } finally {
      setBusy(false);
      setTimeout(() => box.current?.focus(), 50);
    }
  };
  const dial = () => {
    const s = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setSid(s);
    send('', s);
  };
  const hangUp = () => {
    setSid(null);
    setScreen(null);
  };

  return (
    <div className="mx-auto w-full max-w-[300px]">
      <div className="rounded-[2.5rem] bg-navy-950 p-3 shadow-2xl ring-4 ring-slate-300 dark:ring-white/10">
        <div className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-white/20" />
        <div className="flex min-h-[380px] flex-col rounded-[1.8rem] bg-gradient-to-b from-slate-800 to-navy-900 p-4 text-white">
          {!sid ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <Smartphone className="h-10 w-10 text-white/40" />
              <Field label={<span className="text-white/60">Caller's phone</span>}>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="text-center" inputMode="tel" />
              </Field>
              <p className="font-mono text-3xl font-bold tracking-wider">{ussd}</p>
              <button onClick={dial} className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40 hover:bg-emerald-600" aria-label="Dial">
                <Phone className="h-6 w-6" />
              </button>
            </div>
          ) : (
            <div className="flex flex-1 flex-col">
              <div className="mt-6 flex-1 rounded-2xl bg-white p-4 text-[13px] leading-relaxed text-slate-900 shadow-lg">
                {screen ? <pre className="whitespace-pre-wrap font-sans">{screen.message}</pre> : <p className="text-slate-400">USSD code running…</p>}
                {screen && !screen.done && (
                  <form
                    className="mt-3 border-t border-slate-200 pt-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      send(input);
                    }}
                  >
                    <input ref={box} autoFocus value={input} onChange={(e) => setInput(e.target.value)} className="w-full border-b-2 border-brand-600 bg-transparent py-1 outline-none" aria-label="Reply" />
                    <div className="mt-3 flex justify-between text-sm font-bold text-brand-700">
                      <button type="button" onClick={hangUp}>Cancel</button>
                      <button type="submit" disabled={busy} className="inline-flex items-center gap-1">Send <Send className="h-3.5 w-3.5" /></button>
                    </div>
                  </form>
                )}
                {screen?.done && (
                  <div className="mt-3 border-t border-slate-200 pt-3 text-right">
                    <button onClick={hangUp} className="text-sm font-bold text-brand-700">OK</button>
                  </div>
                )}
              </div>
              <button onClick={hangUp} className="mx-auto mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-600 hover:bg-accent-700" aria-label="Hang up">
                <PhoneOff className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Ussd() {
  const me = useCurrentUser();
  const settings = useDB((s) => s.settings);
  const votes = useDB((s) => s.votes);
  const [code, setCode] = useState(settings.ussdCode || '');
  const [sms, setSms] = useState([]);
  useEffect(() => setCode(settings.ussdCode || ''), [settings.ussdCode]);

  const loadSms = async () => {
    if (!LIVE) return;
    const rows = must(await supabase.from('sms_log').select('*').order('created_at', { ascending: false }).limit(40));
    setSms(rows);
  };
  useEffect(() => {
    loadSms();
  }, []);

  if (!LIVE) return <Card><EmptyState icon={RadioTower} title="USSD runs in the live apps" text="Open the MyVoteHub Admin app to test USSD voting with the simulator." /></Card>;

  const saveCode = async () => {
    try {
      must(await supabase.rpc('set_ussd_code', { code }));
      await refresh();
      toast.success(code ? `USSD code set to ${code}` : 'USSD code removed', code ? 'Event pages now show it to voters' : undefined);
    } catch (e) {
      toast.error('Could not save', e.message);
    }
  };
  const ussdVotes = votes.filter((v) => v.channel === 'ussd' && !v.void);
  const today = new Date().toDateString();

  return (
    <>
      <PageHeader title="USSD voting" subtitle="Voters dial a short code, pick a nominee and vote. USSD votes count in the same totals as web votes." />
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="USSD votes" value={ussdVotes.reduce((a, v) => a + v.qty, 0).toLocaleString()} icon={RadioTower} tone="blue" sub={`${ussdVotes.length} sessions with a vote`} />
        <StatCard label="Today" value={ussdVotes.filter((v) => new Date(v.at).toDateString() === today).reduce((a, v) => a + v.qty, 0).toLocaleString()} icon={Phone} tone="green" />
        <StatCard label="USSD code" value={settings.ussdCode || 'Not set'} icon={Smartphone} tone="violet" />
        <StatCard label="SMS receipts" value={settings.smsMode === 'live' ? 'Live' : 'Simulated'} icon={MessageSquare} tone="amber" sub="Until SMS keys are added" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div>
          <Simulator onStep={() => { loadSms(); refresh(); }} />
          <p className="mt-4 text-center text-xs text-slate-500">Runs the real menu on the live database. {settings.testMode ? 'Test mode is on: paid votes are marked TEST.' : ''}</p>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Your USSD code" subtitle="The code voters dial, e.g. *713*44# from your provider. Shown on event and nominee pages." icon={Smartphone} />
            <div className="flex flex-col gap-2 p-5 pt-3 sm:flex-row">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="*713*44#" className="font-mono sm:max-w-xs" disabled={!me?.super} />
              <Button icon={Save} onClick={saveCode} disabled={!me?.super}>Save</Button>
              {!me?.super && <span className="self-center text-xs text-slate-500">Super Admin only</span>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Connect a provider" subtitle="Give your USSD provider this callback URL. Replace KEY with the secret key (kept in supabase/functions/.env and the project's Edge Function secrets)." icon={RadioTower} />
            <div className="space-y-2 p-5 pt-3">
              {PROVIDERS.map(([id, name]) => {
                const url = `${ENDPOINT}?provider=${id}&key=KEY`;
                return (
                  <div key={id} className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
                    <p className="text-sm font-bold text-slate-800 dark:text-white">{name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-2 py-1.5 text-xs dark:bg-white/5">{url}</code>
                      <button onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success('URL copied'))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Copy URL"><Copy className="h-4 w-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card>
            <CardHeader title="SMS receipts" subtitle={settings.smsMode === 'live' ? 'Sent to voters' : 'Simulated — these will be sent once an SMS provider is connected'} icon={MessageSquare} action={<Button size="sm" variant="ghost" icon={RefreshCw} onClick={loadSms}>Refresh</Button>} />
            <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto dark:divide-white/5">
              {sms.map((m) => (
                <div key={m.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold">{m.phone}</span>
                    <span className="flex items-center gap-2 text-[11px] text-slate-400"><Badge tone={m.status === 'sent' ? 'green' : 'slate'}>{m.status}</Badge>{fmtDateTime(m.created_at)}</span>
                  </div>
                  <p className={cx('mt-1 text-sm text-slate-600 dark:text-slate-300')}>{m.message}</p>
                </div>
              ))}
              {!sms.length && <EmptyState icon={MessageSquare} title="No receipts yet" text="Vote with the simulator to see one." />}
            </div>
          </Card>
        </div>
      </div>
      <div className="mt-6 grid gap-6">
        <MenuEditor />
        <UssdEvents />
      </div>
    </>
  );
}
