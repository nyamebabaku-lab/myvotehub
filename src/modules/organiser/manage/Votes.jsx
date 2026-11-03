import { useState } from 'react';
import { AlertTriangle, Ban, Check, Download } from 'lucide-react';
import { useDB } from '../../../data/store';
import { voidVotes } from '../../../lib/voting';
import { methodLabel } from '../../../lib/payments';
import { downloadCSV, fmtDateTime, money, maskVoter } from '../../../lib/format';
import { Badge, Button, Card, CardHeader, DataTable, Tabs, confirmDialog, toast } from '../../../components/ui';

export default function Votes({ event }) {
  const db = useDB();
  const [tab, setTab] = useState(event.votingMode === 'paid' ? 'payments' : 'votes');
  const nomName = (id) => db.nominees.find((n) => n.id === id)?.name || '—';
  const flagged = db.votes.filter((v) => v.eventId === event.id && v.flagged && !v.void);
  const payments = db.payments.filter((p) => p.eventId === event.id);
  const votes = db.votes.filter((v) => v.eventId === event.id);

  const voidAll = async () => {
    if (!(await confirmDialog(`Void ${flagged.length} flagged vote records?`, 'They stop counting toward results. Paid votes stay in your revenue; refund separately if needed.', { confirmLabel: 'Void votes' }))) return;
    voidVotes(flagged.map((v) => v.id), 'Suspicious burst');
    toast.success('Votes voided');
  };
  const clear = () => {
    flagged.forEach((v) => db.update('votes', v.id, { flagged: undefined }));
    toast.success('Marked as genuine');
  };

  return (
    <div className="space-y-5">
      {flagged.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-500/20">
          <CardHeader title={`${flagged.length} suspicious vote records`} subtitle="Unusual bursts from one phone or device" icon={AlertTriangle} action={<div className="flex gap-2"><Button size="sm" variant="secondary" icon={Check} onClick={clear}>Looks fine</Button><Button size="sm" variant="danger" icon={Ban} onClick={voidAll}>Void all</Button></div>} />
          <div className="divide-y divide-slate-100 px-5 pb-3 dark:divide-white/5">
            {flagged.slice(0, 8).map((v) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span><b>{maskVoter(v.voter)}</b> → {nomName(v.nomineeId)} · {v.qty} vote(s)</span>
                <span className="text-xs text-slate-500">{v.flagged} · {fmtDateTime(v.at)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onChange={setTab} tabs={[event.votingMode === 'paid' && { value: 'payments', label: 'Payments', count: payments.length }, { value: 'votes', label: 'Vote records', count: votes.length }].filter(Boolean)} />
        <Button
          variant="secondary"
          icon={Download}
          onClick={() =>
            tab === 'payments'
              ? downloadCSV(`${event.title} payments`, payments.map((p) => ({ Ref: p.ref, Date: p.at, Voter: maskVoter(p.voter), Nominee: nomName(p.nomineeId), Votes: p.votes, Amount: p.amount, Commission: p.commission, Net: p.net, Method: methodLabel(p.method), Status: p.status })))
              : downloadCSV(`${event.title} votes`, votes.map((v) => ({ Date: v.at, Voter: maskVoter(v.voter), Nominee: nomName(v.nomineeId), Votes: v.qty, Channel: v.channel, Round: v.round ?? '', Void: v.void ? 'yes' : '' })))
          }
        >
          Export CSV
        </Button>
      </div>
      {tab === 'payments' ? (
        <DataTable
          rows={payments}
          initialSort={{ key: 'at', dir: 'desc' }}
          searchText={(p) => `${p.ref} ${p.voter} ${nomName(p.nomineeId)}`}
          columns={[
            { key: 'ref', label: 'Ref', render: (p) => <span className="font-mono text-xs font-bold">{p.ref}</span> },
            { key: 'at', label: 'Time', render: (p) => fmtDateTime(p.at), hideOnMobile: true },
            { key: 'nominee', label: 'Nominee', render: (p) => nomName(p.nomineeId), sort: (p) => nomName(p.nomineeId) },
            { key: 'votes', label: 'Votes', className: 'text-right' },
            { key: 'amount', label: 'Amount', render: (p) => <b>{money(p.amount)}</b> },
            { key: 'net', label: 'Net', render: (p) => money(p.net), hideOnMobile: true },
            { key: 'method', label: 'Method', render: (p) => methodLabel(p.method), hideOnMobile: true },
            { key: 'voter', label: 'Payer', render: (p) => maskVoter(p.voter), hideOnMobile: true },
            { key: 'status', label: 'Status', render: (p) => <Badge tone={p.status === 'success' ? 'green' : 'red'}>{p.status}</Badge> },
          ]}
        />
      ) : (
        <DataTable
          rows={votes}
          initialSort={{ key: 'at', dir: 'desc' }}
          searchText={(v) => `${v.voter} ${nomName(v.nomineeId)}`}
          columns={[
            { key: 'at', label: 'Time', render: (v) => fmtDateTime(v.at) },
            { key: 'nominee', label: 'Nominee', render: (v) => nomName(v.nomineeId), sort: (v) => nomName(v.nomineeId) },
            { key: 'qty', label: 'Votes' },
            { key: 'voter', label: 'Voter', render: (v) => maskVoter(v.voter), hideOnMobile: true },
            { key: 'channel', label: 'Channel', render: (v) => <Badge tone="slate">{v.channel}</Badge>, hideOnMobile: true },
            event.rounds && { key: 'round', label: 'Round', hideOnMobile: true },
            { key: 'void', label: 'Status', render: (v) => (v.void ? <Badge tone="red">Void</Badge> : v.flagged ? <Badge tone="amber">Flagged</Badge> : <Badge tone="green">Counted</Badge>), sort: (v) => (v.void ? 2 : v.flagged ? 1 : 0) },
          ].filter(Boolean)}
        />
      )}
    </div>
  );
}
