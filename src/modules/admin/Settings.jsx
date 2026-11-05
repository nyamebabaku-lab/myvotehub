import { useState } from 'react';
import { Save, RotateCcw, Percent, ShieldCheck, Database, FlaskConical, Trash2 } from 'lucide-react';
import { useDB } from '../../data/store';
import { useCurrentUser } from '../../data/selectors';
import { LIVE } from '../../config';
import { setTestMode, clearTestData } from '../../lib/accounts';
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
  const me = useCurrentUser();
  const toggleTest = async () => {
    const next = !f.testMode;
    if (!(await confirmDialog(next ? 'Turn test mode on?' : 'Turn test mode off?', next ? 'Simulated checkout comes back and test money counts again.' : 'Simulated checkout stops and test money no longer counts. Do this only when real Hubtel payments are connected.', { confirmLabel: 'Confirm' }))) return;
    try {
      await setTestMode(next);
      setF((x) => ({ ...x, testMode: next }));
      toast.success(next ? 'Test mode on' : 'Test mode off');
    } catch (e) {
      toast.error('Could not change test mode', e.message);
    }
  };
  const clearTest = async () => {
    if (!(await confirmDialog('Delete all test payments and votes?', 'This cannot be undone.', { confirmLabel: 'Clear test data' }))) return;
    try {
      const n = await clearTestData();
      toast.success('Test data cleared', `${n} vote records removed`);
    } catch (e) {
      toast.error('Could not clear test data', e.message);
    }
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
        {LIVE ? (
          <Card className="xl:col-span-2">
            <CardHeader title="Test mode" subtitle={f.testMode ? 'ON — checkout is simulated and every payment and vote is marked TEST' : 'OFF — only real payments count'} icon={FlaskConical} />
            <div className="flex flex-col gap-3 p-5 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">Keep test mode on until Hubtel is connected. Turning it off hides test money from wallets and results; clearing removes it for good.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant={f.testMode ? 'danger' : 'secondary'} onClick={toggleTest} disabled={!me?.super}>{f.testMode ? 'Turn test mode off' : 'Turn test mode on'}</Button>
                <Button variant="soft-red" icon={Trash2} onClick={clearTest} disabled={!me?.super}>Clear test data</Button>
              </div>
            </div>
          </Card>
        ) : (
        <Card className="xl:col-span-2">
          <CardHeader title="Demo data" subtitle={`Stored in this browser · ${kb} KB used`} icon={Database} />
          <div className="flex flex-col gap-3 p-5 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">This prototype keeps everything on your device. Phase 2 moves it to a secure cloud database with real MoMo and card payments.</p>
            <Button variant="soft-red" icon={RotateCcw} onClick={reset}>Reset demo data</Button>
          </div>
        </Card>
        )}
      </div>
    </>
  );
}
