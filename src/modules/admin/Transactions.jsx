import { useState } from 'react';
import { Download, Banknote, Percent, CheckCircle2, XCircle } from 'lucide-react';
import { useDB } from '../../data/store';
import { useCurrentUser } from '../../data/selectors';
import { methodLabel } from '../../lib/payments';
import { downloadCSV, fmtDateTime, maskVoter, money, sum } from '../../lib/format';
import { Badge, Button, DataTable, PageHeader, Select, StatCard } from '../../components/ui';

export default function Transactions() {
  const user = useCurrentUser();
  const db = useDB();
  const [eventId, setEventId] = useState('');
  const [status, setStatus] = useState('');
  const admin = user.role === 'admin';
  const events = db.events.filter((e) => admin || e.companyId === user.companyId);
  const rows = db.payments
    .filter((p) => (admin || p.companyId === user.companyId) && (!eventId || p.eventId === eventId) && (!status || p.status === status))
    .map((p) => ({ ...p, event: db.events.find((e) => e.id === p.eventId)?.title || '—', nominee: db.nominees.find((n) => n.id === p.nomineeId)?.name || '—', company: db.companies.find((c) => c.id === p.companyId)?.name }));
  const ok = rows.filter((p) => p.status === 'success');
  return (
    <>
      <PageHeader title="Transactions" subtitle={admin ? 'Every vote payment on the platform.' : 'Vote payments for your events.'} actions={<Button variant="secondary" icon={Download} onClick={() => downloadCSV('transactions', rows.map((p) => ({ Ref: p.ref, Date: p.at, Company: p.company, Event: p.event, Nominee: p.nominee, Votes: p.votes, Amount: p.amount, Commission: p.commission, Net: p.net, Method: methodLabel(p.method), Payer: maskVoter(p.voter), Status: p.status })))}>Export CSV</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Gross" value={money(sum(ok, (p) => p.amount))} icon={Banknote} tone="blue" />
        <StatCard label={admin ? 'Commission earned' : 'Commission paid'} value={money(sum(ok, (p) => p.commission))} icon={Percent} tone="red" />
        <StatCard label="Successful" value={ok.length.toLocaleString()} icon={CheckCircle2} tone="green" />
        <StatCard label="Failed" value={(rows.length - ok.length).toLocaleString()} icon={XCircle} tone="amber" sub={`${rows.length ? Math.round(((rows.length - ok.length) / rows.length) * 100) : 0}% failure rate`} />
      </div>
      <DataTable
        rows={rows}
        initialSort={{ key: 'at', dir: 'desc' }}
        searchText={(p) => `${p.ref} ${p.event} ${p.nominee} ${p.voter} ${p.company}`}
        toolbar={
          <>
            <Select className="md:w-56" value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="All events" options={events.map((e) => ({ value: e.id, label: e.title }))} />
            <Select className="md:w-40" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Any status" options={[{ value: 'success', label: 'Successful' }, { value: 'failed', label: 'Failed' }]} />
          </>
        }
        columns={[
          { key: 'ref', label: 'Ref', render: (p) => <span className="font-mono text-xs font-bold">{p.ref}</span> },
          { key: 'at', label: 'Time', render: (p) => fmtDateTime(p.at), hideOnMobile: true },
          admin && { key: 'company', label: 'Company', hideOnMobile: true },
          { key: 'event', label: 'Event', render: (p) => <span className="block max-w-[200px] truncate">{p.event}</span> },
          { key: 'nominee', label: 'Nominee', hideOnMobile: true, render: (p) => <span className="block max-w-[180px] truncate">{p.nominee}</span> },
          { key: 'amount', label: 'Amount', render: (p) => <b>{money(p.amount)}</b> },
          { key: 'commission', label: 'Fee', render: (p) => money(p.commission), hideOnMobile: true },
          { key: 'method', label: 'Method', render: (p) => methodLabel(p.method), hideOnMobile: true },
          { key: 'status', label: 'Status', render: (p) => <Badge tone={p.status === 'success' ? 'green' : 'red'}>{p.status}</Badge> },
        ].filter(Boolean)}
      />
    </>
  );
}
