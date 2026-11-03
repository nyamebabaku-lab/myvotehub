import { useState } from 'react';
import { Save, RotateCcw, Percent, ShieldCheck, Database } from 'lucide-react';
import { useDB } from '../../data/store';
import { Button, Card, CardHeader, Field, Input, PageHeader, Select, confirmDialog, toast } from '../../components/ui';

export default function Settings() {
  const settings = useDB((s) => s.settings);
  const setSettings = useDB((s) => s.setSettings);
  const resetDemo = useDB((s) => s.resetDemo);
  const [f, setF] = useState(settings);
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });
  const save = () => {
    setSettings(f);
    useDB.getState().log('Settings changed', `Commission ${f.defaultCommission}%, min withdrawal ${f.minWithdrawal}`);
    toast.success('Settings saved');
  };
  const reset = async () => {
    if (!(await confirmDialog('Reset all demo data?', 'Every company, event, vote and payment goes back to the original demo.', { confirmLabel: 'Reset' }))) return;
    resetDemo();
    toast.success('Demo data restored');
  };
  const kb = Math.round((localStorage.getItem('myvotehub-db')?.length || 0) / 1024);
  return (
    <>
      <PageHeader title="Platform settings" actions={<Button icon={Save} onClick={save}>Save</Button>} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Revenue" icon={Percent} />
          <div className="grid gap-4 p-5 pt-3 sm:grid-cols-2">
            <Field label="Default commission %" hint="For newly onboarded companies"><Input type="number" min={0} max={50} step={0.5} value={f.defaultCommission} onChange={set('defaultCommission', true)} /></Field>
            <Field label="Minimum withdrawal"><Input type="number" min={0} value={f.minWithdrawal} onChange={set('minWithdrawal', true)} /></Field>
            <Field label="Currency symbol"><Input value={f.currency} onChange={set('currency')} /></Field>
            <Field label="Support phone"><Input value={f.supportPhone} onChange={set('supportPhone')} /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Trust & safety" icon={ShieldCheck} />
          <div className="grid gap-4 p-5 pt-3 sm:grid-cols-2">
            <Field label="Event approval"><Select value={f.requireEventApproval ? 'yes' : 'no'} onChange={(e) => setF({ ...f, requireEventApproval: e.target.value === 'yes' })} options={[{ value: 'yes', label: 'Review every event' }, { value: 'no', label: 'Auto-approve' }]} /></Field>
            <Field label="Flag votes above (per device/min)"><Input type="number" min={3} value={f.maxVotesPerMinute} onChange={set('maxVotesPerMinute', true)} /></Field>
            <Field label="Support email" className="sm:col-span-2"><Input value={f.supportEmail} onChange={set('supportEmail')} /></Field>
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Demo data" subtitle={`Stored in this browser · ${kb} KB used`} icon={Database} />
          <div className="flex flex-col gap-3 p-5 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">This prototype keeps everything on your device. Phase 2 moves it to a secure cloud database with real MoMo and card payments.</p>
            <Button variant="soft-red" icon={RotateCcw} onClick={reset}>Reset demo data</Button>
          </div>
        </Card>
      </div>
    </>
  );
}
