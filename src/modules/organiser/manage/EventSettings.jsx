import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2, Eye, Hash } from 'lucide-react';
import { useDB } from '../../../data/store';
import { useCurrentUser } from '../../../data/selectors';
import { money } from '../../../lib/format';
import { Button, Card, CardHeader, KeyValue, confirmDialog, toast, cx } from '../../../components/ui';

function Switch({ checked, onChange, label, hint }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-bold text-slate-800 dark:text-white">{label}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cx('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-white/20')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  );
}

export default function EventSettings({ event }) {
  const db = useDB();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const company = db.companies.find((c) => c.id === event.companyId);
  const hasVotes = db.votes.some((v) => v.eventId === event.id);
  const set = (patch) => {
    db.update('events', event.id, patch);
    toast.success('Saved');
  };
  const del = async () => {
    if (hasVotes && user.role !== 'admin') return toast.error('Events with votes cannot be deleted', 'Close voting instead, or ask MyVoteHub support.');
    if (!(await confirmDialog(`Delete ${event.title}?`, 'All categories, nominees, votes and scores for this event are removed. Payments stay in the ledger.'))) return;
    db.deleteEvent(event.id);
    db.log('Event deleted', event.title, { companyId: event.companyId });
    navigate('/app/events');
  };
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Visibility" icon={Eye} />
        <div className="divide-y divide-slate-100 px-5 pb-2 dark:divide-white/5">
          <Switch checked={event.showLeaderboard} onChange={(v) => set({ showLeaderboard: v })} label="Public leaderboard" hint="Show rankings while voting is open" />
          <Switch checked={event.showCounts} onChange={(v) => set({ showCounts: v })} label="Show vote counts" hint="Display the number of votes on nominee cards" />
        </div>
      </Card>
      <Card>
        <CardHeader title="Configuration" icon={Hash} action={<Button size="sm" variant="secondary" icon={Pencil} onClick={() => navigate(`/app/events/${event.id}/edit`)}>Edit event</Button>} />
        <div className="p-5 pt-3">
          <KeyValue
            items={[
              ['Voting', event.votingMode === 'paid' ? `${money(event.pricePerVote)} per vote` : `Free · ${event.freeVotesPerVoter}/${event.freePeriod === 'daily' ? 'day' : 'event'}`],
              ['Bundles', event.votingMode === 'paid' ? event.bundles.map((b) => `${b.votes}=${money(b.price)}`).join(' · ') : '—'],
              ['Weighting', `${event.publicWeight}% public / ${event.judgeWeight}% judges`],
              ['Platform commission', `${company?.commissionPct}%`],
              ['Event ID', event.id],
              ['USSD short code', '*920*44#'],
            ]}
          />
        </div>
      </Card>
      <Card className="border-accent-200 xl:col-span-2 dark:border-accent-500/20">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="font-extrabold text-accent-700 dark:text-accent-300">Delete event</p>
            <p className="text-sm text-slate-500">{hasVotes ? 'This event has votes. Only a Super Admin can delete it.' : 'Permanently remove this event and its nominees.'}</p>
          </div>
          <Button variant="danger" icon={Trash2} onClick={del}>Delete event</Button>
        </div>
      </Card>
    </div>
  );
}
