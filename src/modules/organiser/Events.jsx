import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useDB } from '../../data/store';
import { useCurrentUser, useMyEvents } from '../../data/selectors';
import { compactNum, fmtDate, money, sum } from '../../lib/format';
import { eventPhase } from '../../lib/voting';
import { Button, DataTable, PageHeader, Tabs, Badge } from '../../components/ui';
import { Cover, PhaseBadge, TYPE } from '../../components/event';

export default function Events() {
  const user = useCurrentUser();
  const events = useMyEvents();
  const db = useDB();
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const groups = { all: () => true, live: (e) => eventPhase(e) === 'live', review: (e) => ['draft', 'pending', 'rejected', 'upcoming'].includes(eventPhase(e)), past: (e) => ['ended', 'closed'].includes(eventPhase(e)) };
  const rows = events.filter(groups[tab]).map((e) => ({
    ...e,
    company: db.companies.find((c) => c.id === e.companyId)?.name,
    votes: sum(db.votes.filter((v) => v.eventId === e.id && !v.void), (v) => v.qty),
    gross: sum(db.payments.filter((p) => p.eventId === e.id && p.status === 'success'), (p) => p.amount),
    nominees: db.nominees.filter((n) => n.eventId === e.id).length,
    flagged: db.votes.filter((v) => v.eventId === e.id && v.flagged && !v.void).length,
  }));
  const count = (k) => events.filter(groups[k]).length;
  return (
    <>
      <PageHeader
        title={user.role === 'admin' ? 'All events' : 'My events'}
        subtitle={`${events.length} events`}
        actions={user.role === 'organiser' && <Button icon={Plus} onClick={() => navigate('/app/events/new')}>New event</Button>}
      />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All', count: count('all') }, { value: 'live', label: 'Live', count: count('live') }, { value: 'review', label: 'Draft & upcoming', count: count('review') }, { value: 'past', label: 'Past', count: count('past') }]} />
      <DataTable
        rows={rows}
        onRowClick={(r) => navigate(`/app/events/${r.id}`)}
        initialSort={{ key: 'startAt', dir: 'desc' }}
        searchText={(r) => `${r.title} ${r.company}`}
        columns={[
          {
            key: 'title',
            label: 'Event',
            render: (r) => (
              <div className="flex items-center gap-3">
                <Cover event={r} className="h-10 w-10 shrink-0 rounded-xl" iconSize="h-7 w-7" />
                <div className="min-w-0">
                  <p className="max-w-[260px] truncate font-bold text-slate-800 dark:text-white">{r.title}</p>
                  <p className="text-xs text-slate-500">{user.role === 'admin' ? r.company : TYPE[r.type]?.label}</p>
                </div>
              </div>
            ),
          },
          { key: 'status', label: 'Status', render: (r) => <div className="flex items-center gap-1.5"><PhaseBadge event={r} />{r.flagged > 0 && <Badge tone="amber">{r.flagged} flagged</Badge>}</div>, sort: (r) => eventPhase(r) },
          { key: 'votingMode', label: 'Voting', render: (r) => (r.votingMode === 'free' ? <Badge tone="green">Free</Badge> : <Badge tone="blue">Paid · {money(r.pricePerVote)}</Badge>), hideOnMobile: true },
          { key: 'nominees', label: 'Nominees', hideOnMobile: true },
          { key: 'votes', label: 'Votes', render: (r) => <b className="tabular-nums">{compactNum(r.votes)}</b> },
          { key: 'gross', label: 'Sales', render: (r) => (r.votingMode === 'free' ? '—' : money(r.gross)), hideOnMobile: true },
          { key: 'startAt', label: 'Dates', render: (r) => `${fmtDate(r.startAt, 'dd MMM')} – ${fmtDate(r.endAt, 'dd MMM yy')}`, hideOnMobile: true },
        ]}
      />
    </>
  );
}
