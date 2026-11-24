import { useState } from 'react';
import { CheckCircle2, XCircle, Wallet, Clock, BadgeCheck, Send, FileCheck2, Loader2 } from 'lucide-react';
import { useDB } from '../../data/store';
import { decideWithdrawal, destinationLabel, walletFor, markWithdrawalPaid } from '../../lib/wallet';
import { livePayout } from '../../lib/liveVoting';
import { refresh } from '../../data/sync';
import { LIVE } from '../../config';
import { fmtDateTime, money, sum } from '../../lib/format';
import { Avatar, Badge, Button, Card, DataTable, EmptyState, Field, Input, Modal, PageHeader, StatCard, Textarea, toast, confirmDialog } from '../../components/ui';

const TONE = { pending: 'amber', processing: 'blue', paid: 'green', rejected: 'red', failed: 'red' };

export default function Withdrawals() {
  const db = useDB();
  const [reject, setReject] = useState(null);
  const [manual, setManual] = useState(null);
  const [sending, setSending] = useState(null);
  // Needs an admin: new requests, payouts on their way, and failed payouts to retry.
  const pending = db.withdrawals.filter((w) => ['pending', 'processing', 'failed'].includes(w.status));
  const provider = db.settings.payoutProvider === 'hubtel' ? 'Hubtel' : 'Paystack';
  const real = (w) => LIVE && !w.isTest;
  const payOut = async (w) => {
    if (!(await confirmDialog(`Send ${money(w.amount)} to ${name(w.companyId)}?`, `${provider} sends it now to ${destinationLabel(w.destination)} (${w.destination?.name || 'no name'}). Check the account name matches the company.`, { danger: false, confirmLabel: 'Send money' }))) return;
    setSending(w.id);
    try {
      const r = await livePayout(w.id);
      if (r.status === 'paid') toast.success('Payout sent', `${money(w.amount)} · ${destinationLabel(w.destination)}`);
      else if (r.status === 'processing') toast.info('Payout on its way', `${provider} is sending it; this page updates when it lands.`);
      else toast.error('Payout failed', r.message);
    } catch (e) {
      toast.error('Could not send the payout', e.message);
    }
    setSending(null);
    refresh();
  };
  const name = (id) => db.companies.find((c) => c.id === id)?.name;
  const user = (id) => db.users.find((u) => u.id === id)?.name || '—';
  const approve = async (w) => {
    if (!(await confirmDialog(`Pay ${money(w.amount)} to ${name(w.companyId)}?`, `Funds go to ${destinationLabel(w.destination)}.`, { danger: false, confirmLabel: 'Approve & pay' }))) return;
    try {
      await decideWithdrawal(w.id, true);
    } catch (e) {
      return toast.error('Could not approve', e.message);
    }
    toast.success('Payout sent', `${money(w.amount)} · ${destinationLabel(w.destination)}`);
  };
  return (
    <>
      <PageHeader title="Withdrawals" subtitle="Organiser payout requests." />
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Awaiting approval" value={money(sum(pending, (w) => w.amount))} icon={Clock} tone="amber" sub={`${pending.length} requests`} />
        <StatCard label="Paid out (all time)" value={money(sum(db.withdrawals.filter((w) => w.status === 'paid'), (w) => w.amount))} icon={BadgeCheck} tone="green" />
        <StatCard label="Held in wallets" value={money(sum(db.companies, (c) => walletFor(c.id, db).available))} icon={Wallet} tone="blue" sub="Organiser balances" />
        <StatCard label="Rejected" value={db.withdrawals.filter((w) => w.status === 'rejected').length} icon={XCircle} tone="red" />
      </div>
      <h3 className="mb-3 font-extrabold text-slate-900 dark:text-white">Queue</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        {pending.map((w) => {
          const bal = walletFor(w.companyId, db);
          return (
            <Card key={w.id} className="p-5">
              <div className="flex items-start gap-3">
                <Avatar name={name(w.companyId) || '?'} />
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-slate-900 dark:text-white">{name(w.companyId)}</p>
                  <p className="text-xs text-slate-500">Requested by {user(w.requestedBy)} · {fmtDateTime(w.requestedAt)}</p>
                </div>
                <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{money(w.amount)}</p>
              </div>
              {w.status === 'failed' && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200"><b>Payout failed:</b> {w.note || 'no reason given'}. The money is back in the organiser's balance.</p>}
              {w.isTest && <p className="mt-3 text-xs font-bold uppercase tracking-wider text-amber-600">Test withdrawal — no money is sent</p>}
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><p className="text-[11px] font-bold uppercase text-slate-400">Send to</p><p className="font-semibold">{destinationLabel(w.destination)}</p><p className="text-xs text-slate-500">{w.destination?.name}</p></div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><p className="text-[11px] font-bold uppercase text-slate-400">Net earned · paid out</p><p className="font-semibold">{money(bal.net)}</p><p className="text-xs text-slate-500">{money(bal.paidOut)} already paid</p></div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                {w.status === 'processing' ? (
                  <>
                    <span className="mr-auto flex items-center gap-2 text-sm font-semibold text-brand-600"><Loader2 className="h-4 w-4 animate-spin" /> {w.provider === 'hubtel' ? 'Hubtel' : 'Paystack'} is sending it</span>
                    <Button variant="secondary" icon={FileCheck2} onClick={() => setManual({ w, ref: '', note: '' })}>Mark as paid</Button>
                  </>
                ) : (
                  <>
                    <Button variant="soft-red" icon={XCircle} onClick={() => setReject({ w, note: '' })}>Reject</Button>
                    {real(w) ? (
                      <>
                        <Button variant="secondary" icon={FileCheck2} onClick={() => setManual({ w, ref: '', note: '' })}>Mark as paid</Button>
                        {db.settings.autoPayout && <Button icon={Send} disabled={sending === w.id} onClick={() => payOut(w)}>{sending === w.id ? 'Sending…' : w.status === 'failed' ? 'Retry payout' : 'Pay out now'}</Button>}
                      </>
                    ) : (
                      <Button icon={CheckCircle2} onClick={() => approve(w)}>Approve & pay</Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {!pending.length && <Card><EmptyState icon={CheckCircle2} title="No pending withdrawals" /></Card>}
      <h3 className="mb-3 mt-8 font-extrabold text-slate-900 dark:text-white">History</h3>
      <DataTable
        rows={db.withdrawals.filter((w) => !['pending', 'processing', 'failed'].includes(w.status))}
        initialSort={{ key: 'decidedAt', dir: 'desc' }}
        searchText={(w) => `${w.ref} ${name(w.companyId)}`}
        columns={[
          { key: 'ref', label: 'Ref', render: (w) => <span className="font-mono text-xs font-bold">{w.ref}</span> },
          { key: 'company', label: 'Company', render: (w) => name(w.companyId), sort: (w) => name(w.companyId) },
          { key: 'amount', label: 'Amount', render: (w) => <b>{money(w.amount)}</b> },
          { key: 'destination', label: 'To', render: (w) => destinationLabel(w.destination), hideOnMobile: true, nosort: true },
          { key: 'status', label: 'Status', render: (w) => <Badge tone={TONE[w.status]}>{w.status}</Badge> },
          { key: 'payoutRef', label: 'Payout ref', render: (w) => w.payoutRef || w.note || '—', hideOnMobile: true },
          { key: 'decidedAt', label: 'Decided', render: (w) => fmtDateTime(w.decidedAt), hideOnMobile: true },
        ]}
      />
      <Modal open={!!manual} onClose={() => setManual(null)} title="Record a payment you sent" subtitle={manual && `${name(manual.w.companyId)} · ${money(manual.w.amount)} · ${destinationLabel(manual.w.destination)}`} size="sm"
        footer={<><Button variant="secondary" onClick={() => setManual(null)}>Cancel</Button><Button disabled={!manual?.ref.trim()} onClick={async () => { const m = manual; try { await markWithdrawalPaid(m.w.id, m.ref, m.note); setManual(null); toast.success('Recorded as paid', m.ref); } catch (e) { toast.error('Could not save', e.message); } }}>Mark as paid</Button></>}>
        {manual && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Use this when you paid outside MyVoteHub, e.g. a bank transfer. The organiser sees the reference.</p>
            <Field label="Transfer reference"><Input value={manual.ref} onChange={(e) => setManual({ ...manual, ref: e.target.value })} placeholder="e.g. GCB-20261124-0042" /></Field>
            <Field label="Note (optional)"><Input value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
      <Modal open={!!reject} onClose={() => setReject(null)} title="Reject withdrawal" subtitle={reject && `${name(reject.w.companyId)} · ${money(reject.w.amount)}`} size="sm" footer={<><Button variant="secondary" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" onClick={async () => { const r = reject; setReject(null); try { await decideWithdrawal(r.w.id, false, r.note || 'Rejected by admin'); toast.info('Withdrawal rejected'); } catch (e) { toast.error('Could not reject', e.message); } }}>Reject</Button></>}>
        {reject && <Field label="Reason (sent to the organiser)"><Textarea value={reject.note} onChange={(e) => setReject({ ...reject, note: e.target.value })} placeholder="e.g. Payout account name does not match KYC" /></Field>}
      </Modal>
    </>
  );
}
