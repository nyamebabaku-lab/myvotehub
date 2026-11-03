import { useState } from 'react';
import { CheckCircle2, XCircle, Wallet, Clock, BadgeCheck } from 'lucide-react';
import { useDB } from '../../data/store';
import { decideWithdrawal, destinationLabel, walletFor } from '../../lib/wallet';
import { fmtDateTime, money, sum } from '../../lib/format';
import { Avatar, Badge, Button, Card, DataTable, EmptyState, Field, Modal, PageHeader, StatCard, Textarea, toast, confirmDialog } from '../../components/ui';

const TONE = { pending: 'amber', paid: 'green', rejected: 'red' };

export default function Withdrawals() {
  const db = useDB();
  const [reject, setReject] = useState(null);
  const pending = db.withdrawals.filter((w) => w.status === 'pending');
  const name = (id) => db.companies.find((c) => c.id === id)?.name;
  const user = (id) => db.users.find((u) => u.id === id)?.name || '—';
  const approve = async (w) => {
    if (!(await confirmDialog(`Pay ${money(w.amount)} to ${name(w.companyId)}?`, `Funds go to ${destinationLabel(w.destination)}.`, { danger: false, confirmLabel: 'Approve & pay' }))) return;
    decideWithdrawal(w.id, true);
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
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><p className="text-[11px] font-bold uppercase text-slate-400">Send to</p><p className="font-semibold">{destinationLabel(w.destination)}</p><p className="text-xs text-slate-500">{w.destination?.name}</p></div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><p className="text-[11px] font-bold uppercase text-slate-400">Net earned · paid out</p><p className="font-semibold">{money(bal.net)}</p><p className="text-xs text-slate-500">{money(bal.paidOut)} already paid</p></div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="soft-red" icon={XCircle} onClick={() => setReject({ w, note: '' })}>Reject</Button>
                <Button icon={CheckCircle2} onClick={() => approve(w)}>Approve & pay</Button>
              </div>
            </Card>
          );
        })}
      </div>
      {!pending.length && <Card><EmptyState icon={CheckCircle2} title="No pending withdrawals" /></Card>}
      <h3 className="mb-3 mt-8 font-extrabold text-slate-900 dark:text-white">History</h3>
      <DataTable
        rows={db.withdrawals.filter((w) => w.status !== 'pending')}
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
      <Modal open={!!reject} onClose={() => setReject(null)} title="Reject withdrawal" subtitle={reject && `${name(reject.w.companyId)} · ${money(reject.w.amount)}`} size="sm" footer={<><Button variant="secondary" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" onClick={() => { decideWithdrawal(reject.w.id, false, reject.note || 'Rejected by admin'); setReject(null); toast.info('Withdrawal rejected'); }}>Reject</Button></>}>
        {reject && <Field label="Reason (sent to the organiser)"><Textarea value={reject.note} onChange={(e) => setReject({ ...reject, note: e.target.value })} placeholder="e.g. Payout account name does not match KYC" /></Field>}
      </Modal>
    </>
  );
}
