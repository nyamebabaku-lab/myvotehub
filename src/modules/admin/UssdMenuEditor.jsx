// Admin tools for the USSD flow: wording, main-menu options, featured / hidden events.
import { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Save, RotateCcw, ListOrdered, Pin, PinOff, EyeOff, Eye, Type } from 'lucide-react';
import { useDB } from '../../data/store';
import { supabase, must } from '../../lib/supabase';
import { refresh } from '../../data/sync';
import { USSD_TEXTS, USSD_DEFAULTS, USSD_OPTIONS, DEFAULT_OPTIONS, PLACEHOLDERS, homePreview } from '../../lib/ussdTexts';
import { eventPhase } from '../../lib/voting';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, Input, cx, confirmDialog, toast } from '../../components/ui';

function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cx('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-white/20')}>
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

export function MenuEditor() {
  const saved = useDB((s) => s.settings.ussdConfig);
  const [texts, setTexts] = useState({});
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [open, setOpen] = useState('Main menu');
  const [busy, setBusy] = useState(false);
  // Live data refreshes replace the settings object every few seconds; only reload the form when the saved menu really changes.
  const savedKey = JSON.stringify(saved || {});
  useEffect(() => {
    const cfg = JSON.parse(savedKey);
    setTexts(cfg.texts || {});
    setOptions(cfg.options?.length ? cfg.options : DEFAULT_OPTIONS);
  }, [savedKey]);
  const preview = useMemo(() => homePreview(texts, options), [texts, options]);
  const dirty = JSON.stringify({ t: texts, o: options }) !== JSON.stringify({ t: saved?.texts || {}, o: saved?.options?.length ? saved.options : DEFAULT_OPTIONS });

  const move = (i, d) => {
    const next = [...options];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOptions(next);
  };
  const toggle = (i) => {
    const next = options.map((o, j) => (j === i ? { ...o, on: !o.on } : o));
    if (!next.some((o) => o.on)) return toast.error('Keep at least one option on');
    setOptions(next);
  };
  const save = async (cfg = { texts: Object.fromEntries(Object.entries(texts).filter(([, v]) => v?.trim())), options }) => {
    setBusy(true);
    try {
      must(await supabase.rpc('set_ussd_config', { cfg }));
      await refresh();
      toast.success('USSD menu saved', 'Voters see the new wording on their next dial');
    } catch (e) {
      toast.error('Could not save', e.message);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!(await confirmDialog('Reset the USSD menu?', 'All wording and options go back to the MyVoteHub defaults.', { confirmLabel: 'Reset' }))) return;
    save({});
  };

  return (
    <Card>
      <CardHeader title="Menu editor" subtitle="Change what voters read and which options the main menu offers. Try it in the phone simulator after saving." icon={Type}
        action={<div className="flex gap-2"><Button size="sm" variant="ghost" icon={RotateCcw} onClick={reset}>Defaults</Button><Button size="sm" icon={Save} onClick={() => save()} disabled={!dirty || busy}>Save</Button></div>} />
      <div className="grid gap-5 p-5 pt-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-5">
          <div>
            <p className="label flex items-center gap-1.5"><ListOrdered className="h-3.5 w-3.5" /> Main menu options</p>
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-white/5 dark:border-white/10">
              {options.map((o, i) => (
                <div key={o.key} className={cx('flex items-center gap-3 px-3 py-2.5', !o.on && 'opacity-50')}>
                  <span className="w-5 text-center text-sm font-bold text-slate-400">{o.on ? options.slice(0, i + 1).filter((x) => x.on).length : '–'}</span>
                  <span className="flex-1 text-sm font-semibold">{texts[USSD_OPTIONS[o.key]]?.trim() || USSD_DEFAULTS[USSD_OPTIONS[o.key]]}</span>
                  <IconButton icon={ArrowUp} label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-30" />
                  <IconButton icon={ArrowDown} label="Move down" onClick={() => move(i, 1)} disabled={i === options.length - 1} className="disabled:opacity-30" />
                  <Switch checked={o.on} onChange={() => toggle(i)} label={`Show ${o.key}`} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="label">Wording <span className="normal-case tracking-normal text-slate-400">— leave blank for the default · placeholders: {PLACEHOLDERS}</span></p>
            <div className="space-y-2">
              {USSD_TEXTS.map((g) => (
                <div key={g.group} className="rounded-2xl border border-slate-200 dark:border-white/10">
                  <button type="button" onClick={() => setOpen(open === g.group ? null : g.group)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold">
                    {g.group}
                    <span className="text-xs font-semibold text-slate-400">{g.items.filter(([k]) => texts[k]?.trim()).length ? `${g.items.filter(([k]) => texts[k]?.trim()).length} changed` : 'Default'}</span>
                  </button>
                  {open === g.group && (
                    <div className="space-y-3 border-t border-slate-100 p-4 dark:border-white/5">
                      {g.items.map(([k, label, def]) => {
                        const v = texts[k] ?? '';
                        const len = (v.trim() || def).length;
                        return (
                          <label key={k} className="block">
                            <span className="mb-1 flex justify-between text-xs font-semibold text-slate-500">
                              {label}
                              <span className={cx('tabular-nums', len > 160 ? 'text-accent-600' : len > 120 ? 'text-amber-600' : 'text-slate-400')}>{len}/160</span>
                            </span>
                            <Input value={v} placeholder={def} maxLength={160} onChange={(e) => setTexts({ ...texts, [k]: e.target.value })} />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <p className="label">Preview</p>
          <div className="rounded-2xl bg-navy-950 p-3">
            <pre className="whitespace-pre-wrap rounded-xl bg-white p-3 font-sans text-[13px] leading-relaxed text-slate-900">{preview}</pre>
          </div>
          <p className={cx('mt-2 text-xs', preview.length > 182 ? 'font-bold text-accent-600' : 'text-slate-400')}>{preview.length} characters{preview.length > 182 ? ' — too long for some phones; shorten the wording' : ''}</p>
          {dirty && <p className="mt-2 text-xs font-bold text-amber-600">Unsaved changes</p>}
        </div>
      </div>
    </Card>
  );
}

export function UssdEvents() {
  const db = useDB();
  const events = db.events.filter((e) => ['live', 'upcoming'].includes(eventPhase(e))).sort((a, b) => (a.ussdFeatured ?? 99) - (b.ussdFeatured ?? 99) || new Date(a.endAt) - new Date(b.endAt));
  const company = (id) => db.companies.find((c) => c.id === id)?.name;
  const pinned = events.filter((e) => e.ussdFeatured != null);
  const pin = (e) => db.update('events', e.id, { ussdFeatured: e.ussdFeatured != null ? null : (Math.max(0, ...pinned.map((x) => x.ussdFeatured)) + 1) });
  const hide = (e) => db.update('events', e.id, { ussdHidden: !e.ussdHidden });
  return (
    <Card>
      <CardHeader title="Events on USSD" subtitle="Pinned events come first in “Browse events”. Hidden events can’t be voted for by USSD (web voting stays open)." icon={Pin} />
      <div className="divide-y divide-slate-100 dark:divide-white/5">
        {events.map((e) => (
          <div key={e.id} className={cx('flex items-center gap-3 px-5 py-3', e.ussdHidden && 'opacity-60')}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-800 dark:text-white">{e.title}</p>
              <p className="truncate text-xs text-slate-500">{company(e.companyId)}</p>
            </div>
            {e.ussdFeatured != null && <Badge tone="blue">Pinned #{pinned.findIndex((x) => x.id === e.id) + 1}</Badge>}
            {e.ussdEnabled === false && <Badge tone="slate">Off by organiser</Badge>}
            {e.ussdHidden && <Badge tone="red">Hidden</Badge>}
            {eventPhase(e) === 'upcoming' && <Badge tone="amber">Not live yet</Badge>}
            <IconButton icon={e.ussdFeatured != null ? PinOff : Pin} label={e.ussdFeatured != null ? 'Unpin' : 'Pin to top'} onClick={() => pin(e)} />
            <IconButton icon={e.ussdHidden ? Eye : EyeOff} label={e.ussdHidden ? 'Show on USSD' : 'Hide from USSD'} tone={e.ussdHidden ? 'soft' : 'ghost'} onClick={() => hide(e)} />
          </div>
        ))}
        {!events.length && <EmptyState icon={Pin} title="No live or upcoming events" />}
      </div>
    </Card>
  );
}
