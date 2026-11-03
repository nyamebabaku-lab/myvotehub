import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, XCircle, Eye, CheckCircle2 } from 'lucide-react';
import { useDB } from '../../data/store';
import { reviewEvent } from '../../lib/events';
import { fmtDate, fmtDateTime, money } from '../../lib/format';
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Textarea, toast } from '../../components/ui';
import { Cover, TYPE } from '../../components/event';

export default function Approvals() {
  const db = useDB();
  const [reject, setReject] = useState(null);
  const pending = db.events.filter((e) => e.status === 'pending').sort((a, b) => (a.submittedAt || '').localeCompare(b.submittedAt || ''));
  const recent = db.audit.filter((a) => a.action === 'Event approved' || a.action === 'Event rejected').slice(0, 6);
  return (
    <>
      <PageHeader title="Event approvals" subtitle="Check each event before it goes public." />
      <div className="grid gap-4 lg:grid-cols-2">
        {pending.map((e) => {
          const co = db.companies.find((c) => c.id === e.companyId);
          const cats = db.categories.filter((c) => c.eventId === e.id);
          const noms = db.nominees.filter((n) => n.eventId === e.id);
          return (
            <Card key={e.id} className="overflow-hidden">
              <Cover event={e} className="h-28 p-4 text-white">
                <p className="relative text-xs font-bold uppercase tracking-widest text-white/80">{co?.name}</p>
                <p className="relative text-lg font-extrabold">{e.title}</p>
              </Cover>
              <div className="p-5">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="blue">{TYPE[e.type]?.label}</Badge>
                  <Badge tone={e.votingMode === 'paid' ? 'violet' : 'green'}>{e.votingMode === 'paid' ? `Paid · ${money(e.pricePerVote)}` : 'Free'}</Badge>
                  <Badge tone="slate">{cats.length} categories · {noms.length} nominees</Badge>
                  {co?.status !== 'active' && <Badge tone="amber">Company not verified</Badge>}
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-slate-600 dark:text-slate-300">{e.description || 'No description.'}</p>
                <p className="mt-3 text-xs text-slate-500">Voting {fmtDate(e.startAt)} → {fmtDate(e.endAt)} · submitted {fmtDateTime(e.submittedAt)}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to={`/app/events/${e.id}`}><Button variant="secondary" icon={Eye}>Review</Button></Link>
                  <Button variant="soft-red" icon={XCircle} onClick={() => setReject({ event: e, note: '' })}>Reject</Button>
                  <Button icon={ShieldCheck} disabled={co?.status !== 'active'} onClick={() => { reviewEvent(e, true); toast.success('Event approved', e.title); }}>Approve</Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {!pending.length && <Card><EmptyState icon={CheckCircle2} title="All caught up" text="No events are waiting for review." /></Card>}
      {recent.length > 0 && (
        <>
          <h3 className="mb-3 mt-8 font-extrabold text-slate-900 dark:text-white">Recent decisions</h3>
          <Card className="divide-y divide-slate-100 dark:divide-white/5">
            {recent.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span><Badge tone={a.action === 'Event approved' ? 'green' : 'red'}>{a.action.replace('Event ', '')}</Badge> <span className="ml-2">{a.detail}</span></span>
                <span className="text-xs text-slate-400">{fmtDateTime(a.at)}</span>
              </div>
            ))}
          </Card>
        </>
      )}
      <Modal open={!!reject} onClose={() => setReject(null)} title={`Reject ${reject?.event.title}?`} size="sm" footer={<><Button variant="secondary" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" onClick={() => { reviewEvent(reject.event, false, reject.note || 'Please review and resubmit.'); setReject(null); toast.info('Event rejected'); }}>Reject</Button></>}>
        {reject && <Field label="What should the organiser change?"><Textarea value={reject.note} onChange={(e) => setReject({ ...reject, note: e.target.value })} /></Field>}
      </Modal>
    </>
  );
}
