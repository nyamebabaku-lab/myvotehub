import { useMemo, useState } from 'react';
import { Download, Printer, MonitorPlay } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDB } from '../../../data/store';
import { eventResults, usesJudges } from '../../../lib/results';
import { downloadCSV, compactNum } from '../../../lib/format';
import { Button, StatCard, Tabs } from '../../../components/ui';
import ResultsBoard from '../../../components/ResultsBoard';
import { Vote, Trophy, Gavel, Scale } from 'lucide-react';

export default function Results({ event }) {
  const db = useDB();
  const [round, setRound] = useState(event.rounds?.current ?? null);
  const res = useMemo(() => eventResults(event, db, { round }), [event, db, round]);
  const sealed = usesJudges(event) && !event.resultsReleased;
  const exportCSV = () =>
    downloadCSV(
      `${event.title} results`,
      res.categories.flatMap((c) =>
        c.rows.map((r) => ({
          Category: c.category.name, Rank: r.rank ?? 'Evicted', Nominee: r.nominee.name, Code: r.nominee.code, Votes: r.votes, 'Vote share %': r.share.toFixed(2),
          'Public score': r.publicScore.toFixed(2), 'Judge score': r.judgeScore == null ? (sealed ? 'sealed' : '') : r.judgeScore.toFixed(2), 'Final score': r.final.toFixed(2),
        })),
      ),
    );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Grand total votes" value={compactNum(res.grandTotal)} icon={Vote} tone="blue" />
        <StatCard label="Categories" value={res.categories.length} icon={Trophy} tone="amber" />
        <StatCard label="Weighting" value={`${event.publicWeight}/${event.judgeWeight}`} icon={Scale} tone="violet" sub="public / judges" />
        <StatCard label="Judges" value={sealed ? 'Sealed' : usesJudges(event) ? 'Included' : 'Not used'} icon={Gavel} tone={sealed ? 'red' : 'green'} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {event.rounds ? <Tabs value={round} onChange={setRound} tabs={event.rounds.list.map((r) => ({ value: r.n, label: r.label }))} /> : <span />}
        <div className="flex gap-2">
          <Button variant="secondary" icon={Download} onClick={exportCSV}>CSV</Button>
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print / PDF</Button>
          <Link to={`/reveal/${event.id}`} target="_blank"><Button icon={MonitorPlay}>Reveal show</Button></Link>
        </div>
      </div>
      {sealed && <p className="rounded-2xl bg-violet-50 p-4 text-sm text-violet-800 dark:bg-violet-500/10 dark:text-violet-200">Ranked on public votes only. Judges’ scores join the ranking when you release results from the Judges tab.</p>}
      {res.categories.map((c) => (
        <ResultsBoard key={c.category.id} event={event} res={c} sealed={sealed} />
      ))}
    </div>
  );
}
