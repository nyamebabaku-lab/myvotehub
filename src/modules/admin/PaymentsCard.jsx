// Admin → Settings: which provider takes payments and sends payouts, and whether each is connected.
import { useEffect, useState } from 'react';
import { CreditCard, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useDB } from '../../data/store';
import { useCurrentUser } from '../../data/selectors';
import { payHealth } from '../../lib/liveVoting';
import { setPaymentConfig } from '../../lib/accounts';
import { Badge, Button, Card, CardHeader, Field, Select, toast } from '../../components/ui';

const PROVIDERS = [{ value: 'paystack', label: 'Paystack' }, { value: 'hubtel', label: 'Hubtel' }];
const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pay`;

function Status({ ok, label, warn }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
      <span className={ok ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500'}>{label}{!ok && warn && <span className="block text-xs">{warn}</span>}</span>
    </div>
  );
}

export default function PaymentsCard() {
  const settings = useDB((s) => s.settings);
  const me = useCurrentUser();
  const [f, setF] = useState({ pay: settings.payProvider, payout: settings.payoutProvider, auto: settings.autoPayout });
  const [h, setH] = useState(null);
  const [busy, setBusy] = useState(false);
  const saved = JSON.stringify([settings.payProvider, settings.payoutProvider, settings.autoPayout]);
  useEffect(() => { setF({ pay: settings.payProvider, payout: settings.payoutProvider, auto: settings.autoPayout }); }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const load = () => payHealth().then(setH).catch(() => setH({ error: true }));
  useEffect(() => { load(); }, []);
  const save = async () => {
    setBusy(true);
    try {
      await setPaymentConfig(f.pay, f.payout, f.auto);
      toast.success('Payment settings saved');
    } catch (e) {
      toast.error('Could not save', e.message);
    }
    setBusy(false);
  };
  const ps = h?.paystack, hb = h?.hubtel;
  return (
    <Card className="xl:col-span-2">
      <CardHeader title="Payments & payouts" subtitle={settings.testMode ? 'Test mode is on: voters see simulated checkout until you turn it off' : 'Live: voters pay real money'} icon={CreditCard}
        action={<Button variant="ghost" size="sm" icon={RefreshCw} onClick={load}>Check</Button>} />
      <div className="grid gap-6 p-5 pt-3 lg:grid-cols-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Voters pay with"><Select value={f.pay} onChange={(e) => setF({ ...f, pay: e.target.value })} options={PROVIDERS} disabled={!me?.super} /></Field>
          <Field label="Organiser payouts with"><Select value={f.payout} onChange={(e) => setF({ ...f, payout: e.target.value })} options={PROVIDERS} disabled={!me?.super} /></Field>
          <Field label="Approving a withdrawal" className="sm:col-span-2">
            <Select value={f.auto ? 'auto' : 'manual'} onChange={(e) => setF({ ...f, auto: e.target.value === 'auto' })} disabled={!me?.super}
              options={[{ value: 'auto', label: 'Sends the money automatically' }, { value: 'manual', label: 'I send it myself, then record the reference' }]} />
          </Field>
          <div className="sm:col-span-2"><Button onClick={save} disabled={busy || !me?.super}>Save payment settings</Button></div>
        </div>
        <div className="space-y-4 rounded-2xl bg-slate-50 p-4 dark:bg-white/5">
          {!h ? <p className="text-sm text-slate-500">Checking connections…</p> : h.error ? <p className="text-sm text-accent-600">Could not reach the payment service.</p> : (
            <>
              <div className="space-y-2">
                <p className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">Paystack {ps.mode && <Badge tone={ps.mode === 'live' ? 'green' : 'amber'}>{ps.mode === 'live' ? 'Live key' : 'Test key'}</Badge>}</p>
                <Status ok={ps.connected} label="Secret key saved" warn="Run: bash scripts/set-payment-keys.sh paystack" />
                <p className="break-all text-xs text-slate-500">Webhook URL for the Paystack dashboard: <code>{FN}/paystack</code></p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-slate-900 dark:text-white">Hubtel</p>
                <Status ok={hb.connected} label="API keys and POS Sales ID saved" warn="Run: bash scripts/set-payment-keys.sh hubtel" />
                <Status ok={hb.relay} label="Fixed-IP relay connected (needed for MoMo prompts and payouts)" warn="See relay/hubtel-relay.mjs" />
                <Status ok={hb.payouts} label="Prepaid account for payouts" />
              </div>
              {f.pay === 'hubtel' && !hb.relay && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">Without the relay, Hubtel can only take card payments. MoMo prompts will fail.</p>}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
