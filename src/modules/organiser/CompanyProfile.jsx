import { useState } from 'react';
import { Save, BadgeCheck, Clock } from 'lucide-react';
import { useDB } from '../../data/store';
import { useCurrentUser } from '../../data/selectors';
import { METHODS } from '../../lib/payments';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, toast } from '../../components/ui';
import { ImagePicker } from '../../components/event';

export default function CompanyProfile() {
  const user = useCurrentUser();
  const db = useDB();
  const company = db.companies.find((c) => c.id === user.companyId);
  const [f, setF] = useState(company);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const setP = (k) => (e) => setF({ ...f, payout: { ...f.payout, [k]: e.target.value } });
  const save = () => {
    db.update('companies', company.id, { name: f.name, email: f.email, phone: f.phone, city: f.city, industry: f.industry, logo: f.logo, payout: f.payout });
    db.log('Company updated', f.name, { companyId: company.id });
    toast.success('Company profile saved');
  };
  return (
    <>
      <PageHeader title="Company profile" actions={<Button icon={Save} onClick={save}>Save</Button>}>
        <div className="mt-2">{company.status === 'active' ? <Badge tone="green"><BadgeCheck className="h-3 w-3" /> Verified</Badge> : <Badge tone="amber"><Clock className="h-3 w-3" /> Verification {company.kyc}</Badge>}</div>
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <div className="grid gap-4 p-5 pt-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><ImagePicker value={f.logo} onChange={set('logo')} max={256} label="Upload logo" /></div>
            <Field label="Company name" className="sm:col-span-2"><Input value={f.name} onChange={set('name')} /></Field>
            <Field label="Email"><Input value={f.email} onChange={set('email')} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
            <Field label="City"><Input value={f.city} onChange={set('city')} /></Field>
            <Field label="Industry"><Input value={f.industry} onChange={set('industry')} /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Payout account" subtitle="Where withdrawals are sent" />
          <div className="grid gap-4 p-5 pt-3 sm:grid-cols-2">
            <Field label="Method"><Select value={f.payout.type} onChange={setP('type')} options={[{ value: 'momo', label: 'Mobile money' }, { value: 'bank', label: 'Bank transfer' }]} /></Field>
            {f.payout.type === 'momo' ? (
              <Field label="Network"><Select value={f.payout.network} onChange={setP('network')} options={METHODS.filter((m) => m.kind === 'momo').map((m) => ({ value: m.id, label: m.label }))} /></Field>
            ) : (
              <Field label="Bank"><Input value={f.payout.bank || ''} onChange={setP('bank')} /></Field>
            )}
            <Field label="Account / wallet number"><Input value={f.payout.number} onChange={setP('number')} /></Field>
            <Field label="Account name"><Input value={f.payout.name} onChange={setP('name')} /></Field>
            <p className="text-xs text-slate-400 sm:col-span-2">Commission rate: <b>{company.commissionPct}%</b> per paid vote (set by MyVoteHub).</p>
          </div>
        </Card>
      </div>
    </>
  );
}
