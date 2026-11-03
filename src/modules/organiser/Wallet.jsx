import { useState } from 'react';
import { Wallet as WalletIcon, ArrowUpRight, Banknote, Percent, Clock, Landmark } from 'lucide-react';
import { useDB } from '../../data/store';
import { useCurrentUser } from '../../data/selectors';
import { walletFor, requestWithdrawal, destinationLabel } from '../../lib/wallet';
import { fmtDateTime, money, moneyShort, sum } from '../../lib/format';
import { METHODS } from '../../lib/payments';
import { Badge, Button, Card, CardHeader, DataTable, Field, Input, Modal, PageHeader, Select, StatCard, toast, cx } from '../../components/ui';

const WD_TONE = { pending: 'amber', paid: 'green', rejected: 'red', approved: 'blue' };

export default function Wallet() {
  const user = useCurrentUser();
  const db = useDB();
  const company = db.companies.find((c) => c.id === user.companyId);
  const w = walletFor(user.companyId, db);
  const mine = db.withdrawals.filter((x) => x.companyId === user.companyId);
  const events = db.events.filter((e) => e.companyId === user.companyId && e.votingMode === 'paid');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [dest, setDest] = useState(company?.payout || { type: 'momo', network: 'mtn', number: '', name: '' });

  const submit = () => {
    try {
      requestWithdrawal(user.companyId, Number(amount), dest);
      toast.success('Withdrawal requested', `${money(Number(amount))} — MyVoteHub will review it shortly`);
      setOpen(false);
      setAmount('');
    } catch (e) {
      toast.error('Cannot withdraw', e.message);
    }
  };

  return (
    <>
      <PageHeader title="Wallet" subtitle={`${company?.name} · ${company?.commissionPct}% platform commission per paid vote`} actions={<Button variant="danger" icon={ArrowUpRight} onClick={() => setOpen(true)} disabled={company?.status !== 'active'}>Withdraw</Button>} />
      <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 p-6 text-white shadow-xl shadow-brand-900/20 sm:p-8">
        <div className="hero-glow absolute inset-0 opacity-60" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-200">Available to withdraw</p>
            <p className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">{money(w.available)}</p>
            <p className="mt-2 text-sm text-brand-100">{w.pending > 0 ? `${money(w.pending)} on hold in pending withdrawals` : 'No pending withdrawals'}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4 text-sm backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-200">Payout account</p>
            <p className="mt-1 font-bold">{destinationLabel(company?.payout)}</p>
            <p className="text-brand-100">{company?.payout?.name}</p>
          </div>
        </div>
      </div>
      {company?.status !== 'active' && <p className="mb-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">Withdrawals unlock once your company is verified.</p>}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Gross vote sales" value={moneyShort(w.gross)} icon={Banknote} tone="blue" sub={`${money(w.gross)} · ${w.votesSold.toLocaleString()} votes`} />
        <StatCard label="Commission" value={moneyShort(w.commission)} icon={Percent} tone="red" sub={`${money(w.commission)} kept by MyVoteHub`} />
        <StatCard label="Net earnings" value={moneyShort(w.net)} icon={WalletIcon} tone="green" sub={money(w.net)} />
        <StatCard label="Paid out" value={moneyShort(w.paidOut)} icon={Landmark} tone="violet" sub={`${money(w.paidOut)} · ${mine.filter((x) => x.status === 'paid').length} payouts`} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <h3 className="mb-3 font-extrabold text-slate-900 dark:text-white">Withdrawal history</h3>
          <DataTable
            rows={mine}
            search={false}
            initialSort={{ key: 'requestedAt', dir: 'desc' }}
            columns={[
              { key: 'ref', label: 'Ref', render: (x) => <span className="font-mono text-xs font-bold">{x.ref}</span> },
              { key: 'requestedAt', label: 'Requested', render: (x) => fmtDateTime(x.requestedAt) },
              { key: 'amount', label: 'Amount', render: (x) => <b>{money(x.amount)}</b> },
              { key: 'destination', label: 'To', render: (x) => destinationLabel(x.destination), hideOnMobile: true, nosort: true },
              { key: 'status', label: 'Status', render: (x) => <div><Badge tone={WD_TONE[x.status]}>{x.status}</Badge>{x.note && <p className="mt-1 max-w-[200px] whitespace-normal text-[11px] text-slate-500">{x.note}</p>}</div> },
            ]}
          />
        </div>
        <Card>
          <CardHeader title="Earnings by event" icon={Clock} />
          <div className="divide-y divide-slate-100 px-5 pb-3 dark:divide-white/5">
            {events.map((e) => {
              const ew = walletFor(user.companyId, db, e.id);
              return (
                <div key={e.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="min-w-0 truncate font-semibold">{e.title}</span>
                  <span className="shrink-0 text-right"><b className="block tabular-nums">{money(ew.net)}</b><span className="text-xs text-slate-400">of {money(ew.gross)}</span></span>
                </div>
              );
            })}
            {!events.length && <p className="py-4 text-sm text-slate-400">No paid events yet.</p>}
          </div>
        </Card>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Withdraw funds" subtitle={`Available: ${money(w.available)} · minimum ${money(db.settings.minWithdrawal)}`} size="sm" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" onClick={submit}>Request {amount ? money(Number(amount)) : 'withdrawal'}</Button></>}>
        <div className="space-y-4">
          <Field label="Amount">
            <Input type="number" min={db.settings.minWithdrawal} max={w.available} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="text-lg font-bold" />
          </Field>
          <div className="flex gap-2">
            {[0.25, 0.5, 1].map((k) => (
              <button key={k} type="button" onClick={() => setAmount(String(Math.floor(w.available * k * 100) / 100))} className="flex-1 rounded-xl bg-slate-100 py-2 text-xs font-bold hover:bg-slate-200 dark:bg-white/10">{k === 1 ? 'All' : `${k * 100}%`}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[['momo', 'Mobile money'], ['bank', 'Bank']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setDest(k === company?.payout?.type ? company.payout : { type: k, network: 'mtn', bank: '', number: '', name: company?.name })} className={cx('rounded-xl border-2 p-2.5 text-sm font-bold', dest.type === k ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 dark:border-white/10')}>{l}</button>
            ))}
          </div>
          {dest.type === 'momo' ? (
            <Field label="Network"><Select value={dest.network} onChange={(e) => setDest({ ...dest, network: e.target.value })} options={METHODS.filter((m) => m.kind === 'momo').map((m) => ({ value: m.id, label: m.label }))} /></Field>
          ) : (
            <Field label="Bank"><Input value={dest.bank} onChange={(e) => setDest({ ...dest, bank: e.target.value })} /></Field>
          )}
          <Field label={dest.type === 'momo' ? 'Wallet number' : 'Account number'}><Input value={dest.number} onChange={(e) => setDest({ ...dest, number: e.target.value })} /></Field>
          <p className="text-xs text-slate-400">Paid within 24 hours of approval. Total pending: {money(sum(mine.filter((x) => x.status === 'pending'), (x) => x.amount))}</p>
        </div>
      </Modal>
    </>
  );
}
