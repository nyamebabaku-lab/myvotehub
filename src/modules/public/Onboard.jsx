// Company onboarding: details → contact person → payout & KYC → review. Creates a pending company the admin verifies.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, UserRound, Landmark, ClipboardCheck, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { useDB, useSession } from '../../data/store';
import { LIVE } from '../../config';
import { registerCompany, enter } from '../../lib/accounts';
import { Button, Field, Input, Select, cx, toast, KeyValue } from '../../components/ui';
import { ImagePicker } from '../../components/event';
import { METHODS } from '../../lib/payments';
import { destinationLabel } from '../../lib/wallet';

const STEPS = [
  ['Company', Building2],
  ['Contact', UserRound],
  ['Payout & KYC', Landmark],
  ['Review', ClipboardCheck],
];

export default function Onboard() {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: '', industry: 'Entertainment', city: '', email: '', phone: '', logo: null, contactName: '', contactTitle: '', contactEmail: '', password: '', payoutType: 'momo', network: 'mtn', number: '', bank: '', accountName: '', regNo: '', ghanaCard: '', agree: false });
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });
  const navigate = useNavigate();
  const login = useSession((s) => s.login);

  const required = [
    ['name', 'email', 'phone', 'city'],
    ['contactName', 'contactEmail', 'password'],
    ['number', 'accountName', 'regNo', 'ghanaCard'],
    ['agree'],
  ];
  const nextStep = () => {
    const miss = required[step].filter((k) => !f[k]);
    if (f.payoutType === 'bank' && step === 2 && !f.bank) miss.push('bank');
    if (miss.length) return toast.error('Please complete the form', 'Some required fields are empty');
    if (step === 1 && !LIVE && useDB.getState().users.some((u) => u.email.toLowerCase() === f.contactEmail.toLowerCase())) return toast.error('Email already registered', 'Sign in instead');
    if (step === 1 && f.password.length < 6) return toast.error('Password too short', 'Use at least 6 characters');
    if (step < 3) return setStep(step + 1);
    submit();
  };
  const payout = f.payoutType === 'bank' ? { type: 'bank', bank: f.bank, number: f.number, name: f.accountName } : { type: 'momo', network: f.network, number: f.number, name: f.accountName };

  const [busy, setBusy] = useState(false);
  const submitLive = async () => {
    setBusy(true);
    try {
      const company = { name: f.name, industry: f.industry, email: f.email, phone: f.phone, city: f.city, logo: f.logo, kycDocs: { regNo: f.regNo, ghanaCard: f.ghanaCard }, payout };
      await enter(await registerCompany({ email: f.contactEmail, password: f.password, company, name: f.contactName, title: f.contactTitle, phone: f.phone }));
      toast.success('Application received', 'MyVoteHub will review your company and approve your account.');
      navigate('/app');
    } catch (e) {
      toast.error('Could not create the account', e.message);
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    if (LIVE) return submitLive();
    const db = useDB.getState();
    const co = db.add('companies', { name: f.name, industry: f.industry, email: f.email, phone: f.phone, city: f.city, logo: f.logo, brandColor: '#2556eb', kyc: 'submitted', kycDocs: { regNo: f.regNo, ghanaCard: f.ghanaCard }, status: 'pending', commissionPct: db.settings.defaultCommission, payout });
    const user = db.add('users', { role: 'organiser', companyId: co.id, name: f.contactName, title: f.contactTitle || 'Owner', email: f.contactEmail, password: f.password, status: 'active' });
    login(user.id);
    db.log('Company onboarded', `${f.name} applied (KYC submitted)`, { companyId: co.id });
    db.notify({ toRole: 'admin', title: 'New company application', text: f.name, link: '/app/companies' });
    toast.success('Application received', 'You can start building events while we verify your company.');
    navigate('/app');
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-widest text-accent-600">Become an organiser</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Onboard your company</h1>
      <p className="mt-1 text-slate-500">Takes about 3 minutes. Verification usually completes within 24 hours.</p>

      <ol className="mt-8 grid grid-cols-4 gap-2">
        {STEPS.map(([l, Icon], i) => (
          <li key={l} className="flex flex-col items-center gap-2 text-center">
            <span className={cx('flex h-11 w-11 items-center justify-center rounded-2xl transition', i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30' : 'bg-slate-100 text-slate-400 dark:bg-white/5')}>
              {i < step ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
            </span>
            <span className={cx('text-xs font-bold', i === step ? 'text-slate-900 dark:text-white' : 'text-slate-400')}>{l}</span>
          </li>
        ))}
      </ol>

      <div className="card mt-8 p-6">
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name *" className="sm:col-span-2"><Input value={f.name} onChange={set('name')} placeholder="e.g. Golden Stage Events Ltd" /></Field>
            <Field label="Industry"><Select value={f.industry} onChange={set('industry')} options={['Entertainment', 'Music & Entertainment', 'Pageantry', 'Television', 'Education', 'Corporate', 'Religious', 'Sports', 'Other']} /></Field>
            <Field label="City *"><Input value={f.city} onChange={set('city')} placeholder="Accra" /></Field>
            <Field label="Business email *"><Input type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="Business phone *"><Input inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
            <div className="sm:col-span-2"><span className="label">Logo</span><ImagePicker value={f.logo} onChange={set('logo')} max={256} label="Upload logo" /></div>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name *"><Input value={f.contactName} onChange={set('contactName')} /></Field>
            <Field label="Job title"><Input value={f.contactTitle} onChange={set('contactTitle')} placeholder="Event Director" /></Field>
            <Field label="Sign-in email *"><Input type="email" value={f.contactEmail} onChange={set('contactEmail')} /></Field>
            <Field label="Password *" hint="At least 6 characters"><Input type="password" value={f.password} onChange={set('password')} /></Field>
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="label">Receive payouts by</span>
              <div className="grid grid-cols-2 gap-2">
                {[['momo', 'Mobile money'], ['bank', 'Bank transfer']].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setF({ ...f, payoutType: k })} className={cx('rounded-2xl border-2 p-3 text-sm font-bold', f.payoutType === k ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' : 'border-slate-200 dark:border-white/10')}>{l}</button>
                ))}
              </div>
            </div>
            {f.payoutType === 'momo' ? (
              <Field label="Network"><Select value={f.network} onChange={set('network')} options={METHODS.filter((m) => m.kind === 'momo').map((m) => ({ value: m.id, label: m.label }))} /></Field>
            ) : (
              <Field label="Bank *"><Select value={f.bank} onChange={set('bank')} placeholder="Select bank" options={['GCB Bank', 'Ecobank Ghana', 'Stanbic Bank', 'Absa Bank Ghana', 'Fidelity Bank', 'CalBank', 'Zenith Bank', 'Access Bank']} /></Field>
            )}
            <Field label={f.payoutType === 'momo' ? 'Wallet number *' : 'Account number *'}><Input inputMode="numeric" value={f.number} onChange={set('number')} /></Field>
            <Field label="Account name *" className="sm:col-span-2"><Input value={f.accountName} onChange={set('accountName')} /></Field>
            <Field label="Business registration no. *"><Input value={f.regNo} onChange={set('regNo')} placeholder="CS123456789" /></Field>
            <Field label="Director's Ghana Card no. *"><Input value={f.ghanaCard} onChange={set('ghanaCard')} placeholder="GHA-000000000-0" /></Field>
          </div>
        )}
        {step === 3 && (
          <div>
            <KeyValue items={[['Company', f.name], ['Industry', f.industry], ['City', f.city], ['Email', f.email], ['Contact', `${f.contactName} · ${f.contactEmail}`], ['Payout', destinationLabel(payout)], ['Registration', f.regNo], ['Ghana Card', f.ghanaCard]]} />
            <div className="mt-6 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900 dark:bg-brand-500/10 dark:text-brand-100">
              <b>Pricing:</b> MyVoteHub keeps {useDB.getState().settings.defaultCommission}% of each paid vote. Free events are free to run. Payouts go to the account above after approval.
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand-600" checked={f.agree} onChange={set('agree')} />
              I confirm these details are correct and agree to the organiser terms.
            </label>
          </div>
        )}
        <div className="mt-8 flex justify-between gap-2 border-t border-slate-100 pt-5 dark:border-white/5">
          <Button variant="secondary" icon={ArrowLeft} disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
          <Button variant={step === 3 ? 'danger' : 'primary'} onClick={nextStep} disabled={busy}>
            {step === 3 ? 'Submit application' : 'Continue'} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
