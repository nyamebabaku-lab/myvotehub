import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Send, Play, Square, CalendarPlus, ExternalLink, MonitorPlay, ShieldCheck, XCircle, Trophy, LayoutDashboard, Users, Gavel, UserX, Receipt, Settings2 } from 'lucide-react';
import { useDB } from '../../data/store';
import { useCurrentUser } from '../../data/selectors';
import { eventPhase, isPublic } from '../../lib/voting';
import { usesJudges } from '../../lib/results';
import { submitEvent, reviewEvent, openVoting, closeVoting, extendVoting } from '../../lib/events';
import { Button, EmptyState, Modal, Tabs, Textarea, confirmDialog, toast, Field } from '../../components/ui';
import { Cover, PhaseBadge, TYPE } from '../../components/event';
import Overview from './manage/Overview';
import Nominees from './manage/Nominees';
import Judges from './manage/Judges';
import Results from './manage/Results';
import Rounds from './manage/Rounds';
import Votes from './manage/Votes';
import EventSettings from './manage/EventSettings';

export default function EventManage() {
  const { id } = useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const event = useDB((s) => s.events.find((e) => e.id === id));
  const company = useDB((s) => s.companies.find((c) => c.id === event?.companyId));
  const flagged = useDB((s) => s.votes.filter((v) => v.eventId === id && v.flagged && !v.void).length);
  const [tab, setTab] = useState('overview');
  const [reject, setReject] = useState(null);
  if (!event) return <EmptyState title="Event not found" />;
  const mine = user.role === 'admin' || event.companyId === user.companyId;
  if (!mine) return <EmptyState title="Not your event" />;

  const phase = eventPhase(event);
  const isAdmin = user.role === 'admin';
  const act = async (fn, title, text, label, danger = false) => {
    if (title && !(await confirmDialog(title, text, { danger, confirmLabel: label }))) return;
    fn(event);
    toast.success(label || 'Done', event.title);
  };

  const actions = [];
  if (['draft', 'rejected'].includes(event.status)) {
    actions.push(<Button key="edit" variant="secondary" icon={Pencil} onClick={() => navigate(`/app/events/${id}/edit`)}>Edit</Button>);
    if (!isAdmin) actions.push(<Button key="sub" icon={Send} onClick={() => act(submitEvent, 'Submit for approval?', 'MyVoteHub will review your event before it goes public.', 'Submit', false)}>Submit for approval</Button>);
  }
  if (event.status === 'pending' && isAdmin) {
    actions.push(<Button key="rej" variant="soft-red" icon={XCircle} onClick={() => setReject('')}>Reject</Button>);
    actions.push(<Button key="app" icon={ShieldCheck} onClick={() => act((e) => reviewEvent(e, true), null, null, 'Event approved')}>Approve</Button>);
  }
  if (event.status === 'approved') {
    actions.push(<Button key="ed" variant="secondary" icon={Pencil} onClick={() => navigate(`/app/events/${id}/edit`)}>Edit</Button>);
    actions.push(<Button key="open" variant="danger" icon={Play} onClick={() => act(openVoting, 'Open voting now?', 'The event becomes live and voters can start voting immediately.', 'Voting opened', false)}>Open voting</Button>);
  }
  if (phase === 'live') {
    actions.push(<Button key="ext" variant="secondary" icon={CalendarPlus} onClick={() => act((e) => extendVoting(e, 3), 'Extend voting by 3 days?', 'The closing time moves 3 days later.', 'Voting extended', false)}>Extend</Button>);
    actions.push(<Button key="close" variant="soft-red" icon={Square} onClick={() => act(closeVoting, 'Close voting?', 'No more votes will be accepted. You can reopen later.', 'Voting closed')}>Close voting</Button>);
  }
  if (phase === 'ended' || event.status === 'closed') {
    actions.push(<Button key="reopen" variant="secondary" icon={CalendarPlus} onClick={() => act((e) => extendVoting(e, 3), 'Reopen voting for 3 days?', 'Voters can vote again until the new closing time.', 'Voting reopened', false)}>Reopen 3 days</Button>);
    if (phase === 'ended') actions.push(<Button key="close2" variant="soft-red" icon={Square} onClick={() => act(closeVoting, null, null, 'Voting closed')}>Mark closed</Button>);
  }

  const tabs = [
    { value: 'overview', label: 'Overview', icon: LayoutDashboard },
    { value: 'nominees', label: 'Nominees', icon: Users },
    usesJudges(event) && { value: 'judges', label: 'Judges', icon: Gavel },
    { value: 'results', label: 'Results', icon: Trophy },
    event.rounds && { value: 'rounds', label: 'Rounds & evictions', icon: UserX },
    { value: 'votes', label: 'Votes & payments', icon: Receipt, count: flagged || undefined },
    { value: 'settings', label: 'Settings', icon: Settings2 },
  ].filter(Boolean);

  return (
    <>
      <Link to="/app/events" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Events
      </Link>
      <Cover event={event} className="rounded-3xl text-white" iconSize="h-40 w-40">
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950/70 to-transparent" />
        <div className="relative flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <PhaseBadge event={event} className="bg-white/95" />
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold backdrop-blur">{TYPE[event.type]?.label}</span>
              {event.resultsReleased && <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold">Results released</span>}
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{event.title}</h1>
            <p className="text-sm text-white/80">{company?.name} · {event.votingMode === 'paid' ? 'Paid voting' : 'Free voting'} · {event.publicWeight}% public / {event.judgeWeight}% judges</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isPublic(event) && (
              <>
                <Link to={`/e/${event.id}`} target="_blank"><Button variant="secondary" icon={ExternalLink}>Public page</Button></Link>
                <Link to={`/reveal/${event.id}`} target="_blank"><Button variant="secondary" icon={MonitorPlay}>Reveal</Button></Link>
              </>
            )}
            {actions}
          </div>
        </div>
      </Cover>
      {event.status === 'rejected' && event.reviewNote && (
        <p className="mt-4 rounded-2xl border border-accent-200 bg-accent-50 p-4 text-sm text-accent-800 dark:border-accent-500/20 dark:bg-accent-500/10 dark:text-accent-200"><b>Changes requested:</b> {event.reviewNote}</p>
      )}
      {event.status === 'pending' && !isAdmin && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">This event is with MyVoteHub for review. You’ll get a notification when it’s approved.</p>
      )}
      <Tabs className="mb-5 mt-6" tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'overview' && <Overview event={event} />}
      {tab === 'nominees' && <Nominees event={event} />}
      {tab === 'judges' && <Judges event={event} />}
      {tab === 'results' && <Results event={event} />}
      {tab === 'rounds' && <Rounds event={event} />}
      {tab === 'votes' && <Votes event={event} />}
      {tab === 'settings' && <EventSettings event={event} />}

      <Modal
        open={reject !== null}
        onClose={() => setReject(null)}
        title="Reject event"
        subtitle="Tell the organiser what to change."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReject(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { reviewEvent(event, false, reject || 'Please review and resubmit.'); setReject(null); toast.info('Event rejected'); }}>Reject</Button>
          </>
        }
      >
        <Field label="Reason"><Textarea value={reject || ''} onChange={(e) => setReject(e.target.value)} placeholder="e.g. Add nominee photos and a clearer description." /></Field>
      </Modal>
    </>
  );
}
