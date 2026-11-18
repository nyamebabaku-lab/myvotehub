// Organiser's USSD settings for one event: on/off, which bundles, "Other amount", greeting — with a live preview.
import { useEffect, useState } from 'react';
import { RadioTower, Save } from 'lucide-react';
import { useDB } from '../../../data/store';
import { useUssdCode } from '../../../data/selectors';
import { USSD_DEFAULTS } from '../../../lib/ussdTexts';
import { Button, Card, CardHeader, Input, cx, toast } from '../../../components/ui';

const cedi = (n) => `GHS ${Number(n).toFixed(2)}`;

export default function UssdCard({ event }) {
  const db = useDB();
  const code = useUssdCode();
  const texts = useDB((s) => s.settings.ussdConfig?.texts || {});
  const t = (k) => (texts[k]?.trim() ? texts[k] : USSD_DEFAULTS[k]);
  const paid = event.votingMode === 'paid';
  const all = event.bundles || [];
  const [picked, setPicked] = useState([]);
  const [greeting, setGreeting] = useState('');
  useEffect(() => {
    const chosen = event.ussdBundles || all.slice(0, 4);
    setPicked(all.flatMap((b, i) => (chosen.some((c) => c.votes === b.votes && c.price === b.price) ? [i] : [])));
    setGreeting(event.ussdGreeting || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when this event's saved USSD settings change
  }, [event.id, event.ussdBundles, event.ussdGreeting]);

  const enabled = event.ussdEnabled !== false;
  const other = event.ussdOtherAmount !== false;
  const set = (patch, msg = 'Saved') => {
    db.update('events', event.id, patch);
    toast.success(msg);
  };
  const toggleBundle = (i) => {
    const next = picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i].sort((a, b) => a - b);
    if (!next.length) return toast.error('Keep at least one bundle');
    if (next.length > 4) return toast.error('Up to 4 bundles fit on a USSD screen');
    setPicked(next);
    const list = next.map((x) => all[x]);
    const isDefault = JSON.stringify(list) === JSON.stringify(all.slice(0, 4));
    set({ ussdBundles: isDefault ? null : list }, 'USSD bundles saved');
  };

  const nominee = { name: 'Kwesi Blaze', code: 'AOY-01' };
  const title = t('vote_title').replace('{name}', nominee.name).replace('{code}', nominee.code).replace('{event}', event.title);
  const lines = [greeting.trim(), title];
  if (paid) {
    picked.forEach((x, i) => lines.push(`${i + 1}. ${all[x].votes} vote${all[x].votes > 1 ? 's' : ''} ${cedi(all[x].price)}`));
    if (other) lines.push(`${picked.length + 1}. ${t('other_amount')}`);
  } else lines.push(`1. ${t('free_option')}`);
  lines.push('0. Back');
  const preview = lines.filter(Boolean).join('\n');

  const Toggle = ({ on, onClick, label, hint }) => (
    <div className="flex items-center justify-between gap-4 py-3">
      <div><p className="text-sm font-bold text-slate-800 dark:text-white">{label}</p><p className="text-xs text-slate-500">{hint}</p></div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} className={cx('relative h-6 w-11 shrink-0 rounded-full transition', on ? 'bg-brand-600' : 'bg-slate-300 dark:bg-white/20')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', on ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  );

  return (
    <Card className="xl:col-span-2">
      <CardHeader title="USSD voting" subtitle={code ? `Voters dial ${code}. These settings change what they see for this event.` : 'MyVoteHub has not set up the USSD code yet; you can prepare these settings now.'} icon={RadioTower} />
      <div className="grid gap-6 p-5 pt-2 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          {event.ussdHidden && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">MyVoteHub has hidden this event from USSD. Contact support to bring it back.</p>}
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            <Toggle on={enabled} onClick={() => set({ ussdEnabled: !enabled }, enabled ? 'Removed from USSD' : 'Shown on USSD')} label="Show this event on USSD" hint="Off: voters can still vote on the web and app" />
            {paid && <Toggle on={other} onClick={() => set({ ussdOtherAmount: !other })} label="Offer “Other amount”" hint="Let voters type any number of votes" />}
          </div>
          {paid && (
            <div className="mt-3">
              <p className="label">Bundles on USSD (up to 4)</p>
              <div className="flex flex-wrap gap-2">
                {all.map((b, i) => (
                  <button key={i} type="button" onClick={() => toggleBundle(i)} className={cx('rounded-xl border-2 px-3 py-2 text-sm font-bold transition', picked.includes(i) ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' : 'border-slate-200 text-slate-500 dark:border-white/10')}>
                    {b.votes} vote{b.votes > 1 && 's'} · {cedi(b.price)}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">Prices come from your web bundles. Change them with Edit event.</p>
            </div>
          )}
          <div className="mt-4">
            <p className="label">Greeting (optional, shown above the vote options)</p>
            <div className="flex gap-2">
              <Input value={greeting} maxLength={60} onChange={(e) => setGreeting(e.target.value)} placeholder="e.g. Vote for your Artiste of the Year!" />
              <Button icon={Save} onClick={() => set({ ussdGreeting: greeting.trim() || null }, 'Greeting saved')} disabled={(greeting.trim() || null) === (event.ussdGreeting || null)}>Save</Button>
            </div>
            <p className="mt-1 text-right text-xs text-slate-400">{greeting.length}/60</p>
          </div>
        </div>
        <div>
          <p className="label">Preview</p>
          <div className={cx('rounded-2xl bg-navy-950 p-3', !enabled && 'opacity-40')}>
            <pre className="whitespace-pre-wrap rounded-xl bg-white p-3 font-sans text-[13px] leading-relaxed text-slate-900">{preview}</pre>
          </div>
          <p className="mt-2 text-xs text-slate-400">{enabled ? 'Example nominee shown.' : 'Not on USSD.'}</p>
        </div>
      </div>
    </Card>
  );
}
