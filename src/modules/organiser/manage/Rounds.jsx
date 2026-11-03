import { useMemo } from 'react';
import { SkipForward, UserX, History } from 'lucide-react';
import { useDB } from '../../../data/store';
import { categoryResults } from '../../../lib/results';
import { closeRound } from '../../../lib/eviction';
import { fmtDateTime } from '../../../lib/format';
import { Badge, Button, Card, CardHeader, DataTable, Field, Input, Select, confirmDialog, toast } from '../../../components/ui';
import { NomineePhoto } from '../../../components/event';

export default function Rounds({ event }) {
  const db = useDB();
  const r = event.rounds;
  const current = r.list.find((x) => x.n === r.current);
  const cats = db.categories.filter((c) => c.eventId === event.id);
  // Who would leave if the round closed now (bottom N competing per category).
  const atRisk = useMemo(
    () =>
      cats.flatMap((c) => {
        const rows = categoryResults(event, c, db, { round: r.current, withJudges: true }).rows.filter((x) => x.competing);
        return rows.length > 1 ? rows.slice(-Math.min(r.autoEvict, rows.length - 1)) : [];
      }),
    [cats, event, db, r],
  );
  const setRounds = (patch) => db.update('events', event.id, { rounds: { ...r, ...patch } });
  const close = async () => {
    const names = atRisk.map((x) => x.nominee.name).join(', ') || 'nobody';
    if (!(await confirmDialog(`Close ${current?.label}?`, `${r.autoEvict ? `Lowest-scoring nominees will be evicted: ${names}. ` : ''}${r.carryOver ? 'Votes carry over' : 'Votes reset'} for ${`Week ${r.current + 1}`}.`, { confirmLabel: 'Close round' }))) return;
    const out = closeRound(event, r.autoEvict);
    toast.success(`${current?.label} closed`, out.length ? `Evicted: ${out.map((n) => n.name).join(', ')}` : 'No evictions');
  };
  const evictions = db.evictions.filter((e) => e.eventId === event.id).map((e) => ({ ...e, nominee: db.nominees.find((n) => n.id === e.nomineeId) }));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader title={`${current?.label} — in progress`} subtitle={`Votes ${r.carryOver ? 'carry over between rounds' : 'reset every round'} · ${r.autoEvict} eviction(s) per category`} icon={SkipForward} />
          <div className="p-5 pt-3">
            <p className="label">At risk if the round closed now</p>
            <div className="flex flex-wrap gap-3">
              {atRisk.map((x) => (
                <div key={x.nominee.id} className="flex items-center gap-3 rounded-2xl border border-accent-200 bg-accent-50 p-2 pr-4 dark:border-accent-500/20 dark:bg-accent-500/10">
                  <NomineePhoto nominee={x.nominee} className="h-10 w-10" rounded="rounded-xl" text="text-xs" />
                  <div>
                    <p className="text-sm font-bold text-accent-800 dark:text-accent-200">{x.nominee.name}</p>
                    <p className="text-xs text-accent-600">{x.votes.toLocaleString()} votes</p>
                  </div>
                </div>
              ))}
              {!atRisk.length && <p className="text-sm text-slate-400">No one — automatic eviction is off or too few nominees remain.</p>}
            </div>
            <Button variant="danger" icon={UserX} className="mt-5" onClick={close}>Close {current?.label} & evict</Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Round rules" />
          <div className="space-y-4 p-5 pt-3">
            <Field label="Evictions per round (per category)"><Input type="number" min={0} max={5} value={r.autoEvict} onChange={(e) => setRounds({ autoEvict: Number(e.target.value) })} /></Field>
            <Field label="Votes between rounds"><Select value={r.carryOver ? 'carry' : 'reset'} onChange={(e) => setRounds({ carryOver: e.target.value === 'carry' })} options={[{ value: 'reset', label: 'Reset every round' }, { value: 'carry', label: 'Carry over' }]} /></Field>
            <div className="flex flex-wrap gap-2">
              {r.list.map((x) => <Badge key={x.n} tone={x.closedAt ? 'slate' : 'red'} dot={!x.closedAt}>{x.label}{x.closedAt ? ' · closed' : ' · live'}</Badge>)}
            </div>
          </div>
        </Card>
      </div>
      <div>
        <h3 className="mb-3 flex items-center gap-2 font-extrabold text-slate-900 dark:text-white"><History className="h-4 w-4" /> Eviction history</h3>
        <DataTable
          rows={evictions}
          search={false}
          initialSort={{ key: 'at', dir: 'desc' }}
          columns={[
            { key: 'nominee', label: 'Nominee', render: (e) => <div className="flex items-center gap-3">{e.nominee && <NomineePhoto nominee={e.nominee} className="h-9 w-9" rounded="rounded-xl" text="text-[10px]" />}<b>{e.nominee?.name}</b></div>, sort: (e) => e.nominee?.name },
            { key: 'round', label: 'Round', render: (e) => r.list.find((x) => x.n === e.round)?.label || '—' },
            { key: 'mode', label: 'Type', render: (e) => <Badge tone={e.mode === 'auto' ? 'blue' : 'amber'}>{e.mode === 'auto' ? 'Automatic' : 'Manual'}</Badge> },
            { key: 'reason', label: 'Reason', hideOnMobile: true },
            { key: 'at', label: 'When', render: (e) => fmtDateTime(e.at), hideOnMobile: true },
          ]}
        />
      </div>
    </div>
  );
}
