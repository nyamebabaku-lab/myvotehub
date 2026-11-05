import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LIVE } from '../../config';
import { liveReceipt } from '../../lib/liveVoting';
import { CheckCircle2, Printer, XCircle } from 'lucide-react';
import { useDB } from '../../data/store';
import { fmtDateTime, money } from '../../lib/format';
import { methodLabel } from '../../lib/payments';
import { Button, EmptyState, KeyValue } from '../../components/ui';
import Logo from '../../components/layout/Logo';

export default function Receipt() {
  const { ref } = useParams();
  const local = useDB((s) => s.payments.find((p) => p.ref === ref));
  const [remote, setRemote] = useState(LIVE ? undefined : null);
  useEffect(() => {
    if (LIVE) liveReceipt(ref).then((r) => setRemote(r && { ...r, at: r.created_at, eventId: r.event_id, nomineeId: r.nominee_id, amount: Number(r.amount), isTest: r.is_test })).catch(() => setRemote(null));
  }, [ref]);
  const pay = LIVE ? remote : local;
  const event = useDB((s) => s.events.find((e) => e.id === pay?.eventId));
  const nominee = useDB((s) => s.nominees.find((n) => n.id === pay?.nomineeId));
  if (pay === undefined) return null;
  if (!pay) return <EmptyState title="Receipt not found" text={`No payment with reference ${ref}.`} />;
  const ok = pay.status === 'success';
  const mask = (v) => (v.includes('@') || v.startsWith('card') ? v : `${v.slice(0, 3)}****${v.slice(-3)}`);
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="card print-area overflow-hidden">
        <div className="flex items-center justify-between border-b border-dashed border-slate-200 p-6 dark:border-white/10">
          <Logo />
          {ok ? <CheckCircle2 className="h-8 w-8 text-emerald-500" /> : <XCircle className="h-8 w-8 text-accent-600" />}
        </div>
        <div className="p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{ok ? 'Payment receipt' : 'Failed payment'}{pay.isTest && ' · TEST — no real money'}</p>
          <p className="mt-1 text-4xl font-extrabold text-slate-900 dark:text-white">{money(pay.amount)}</p>
          <p className="mt-1 text-sm text-slate-500">{pay.votes} vote{pay.votes > 1 && 's'} for <b className="text-slate-700 dark:text-slate-200">{nominee?.name}</b></p>
          <div className="mt-6">
            <KeyValue items={[['Reference', <span key="r" className="font-mono">{pay.ref}</span>], ['Date', fmtDateTime(pay.at)], ['Event', event?.title], ['Nominee code', nominee?.code], ['Paid with', methodLabel(pay.method)], ['Account', mask(pay.voter)], ['Status', ok ? 'Successful' : 'Failed']]} />
          </div>
        </div>
      </div>
      <div className="no-print mt-4 flex gap-2">
        <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
        <Link to={`/e/${pay.eventId}`} className="flex-1"><Button className="w-full">Back to event</Button></Link>
      </div>
    </div>
  );
}
