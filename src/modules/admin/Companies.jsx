import { useState } from 'react';
import { BadgeCheck, Ban, RotateCcw, Plus, FileCheck2 } from 'lucide-react';
import { useDB } from '../../data/store';
import { LIVE } from '../../config';
import { setCompanyStatus } from '../../lib/accounts';
import { walletFor, destinationLabel } from '../../lib/wallet';
import { fmtDate, money } from '../../lib/format';
import { Avatar, Badge, Button, DataTable, Field, FormModal, Input, KeyValue, Modal, PageHeader, Tabs, toast, confirmDialog } from '../../components/ui';

const STATUS = { active: ['green', 'Active'], pending: ['amber', 'Pending KYC'], suspended: ['red', 'Suspended'], deactivated: ['slate', 'Deactivated'] };

export default function Companies() {
  const db = useDB();
  const [tab, setTab] = useState('all');
  const [view, setView] = useState(null);
  const [adding, setAdding] = useState(false);
  const rows = db.companies
    .filter((c) => tab === 'all' || c.status === tab)
    .map((c) => ({ ...c, w: walletFor(c.id, db), events: db.events.filter((e) => e.companyId === c.id).length }));
  const company = view && db.companies.find((c) => c.id === view);
  const w = company && walletFor(company.id, db);

  const setStatus = async (c, status) => {
    if (status === 'suspended' && !(await confirmDialog(`Suspend ${c.name}?`, 'Their organisers cannot withdraw and new events cannot be approved.', { confirmLabel: 'Suspend' }))) return;
    if (LIVE) {
      try {
        await setCompanyStatus(c.id, status);
        return toast.success(status === 'active' ? 'Company verified' : 'Company suspended', c.name);
      } catch (e) {
        return toast.error('Could not update the company', e.message);
      }
    }
    db.update('companies', c.id, { status, kyc: status === 'active' ? 'verified' : c.kyc });
    db.log(status === 'active' ? 'Company verified' : 'Company suspended', c.name, { companyId: c.id });
    db.notify({ companyId: c.id, title: status === 'active' ? 'Your company is verified ✅' : 'Account suspended', text: status === 'active' ? 'You can now publish events and withdraw.' : 'Contact MyVoteHub support.', link: '/app' });
    toast.success(status === 'active' ? 'Company verified' : 'Company suspended', c.name);
  };
  const create = (v) => {
    const c = db.add('companies', { ...v, commissionPct: Number(v.commissionPct) || db.settings.defaultCommission, status: 'active', kyc: 'verified', brandColor: '#2556eb', payout: { type: 'momo', network: 'mtn', number: v.phone, name: v.name } });
    if (v.ownerEmail) db.add('users', { role: 'organiser', companyId: c.id, name: v.ownerName || v.name, email: v.ownerEmail, title: 'Owner', password: 'demo123', status: 'active' });
    db.log('Company onboarded', `${v.name} added by admin`, { companyId: c.id });
    toast.success('Company added', v.ownerEmail ? `Organiser sign-in: ${v.ownerEmail} / demo123` : v.name);
    setAdding(false);
  };

  return (
    <>
      <PageHeader title="Companies" subtitle="Organisations that run events on MyVoteHub." actions={!LIVE && <Button icon={Plus} onClick={() => setAdding(true)}>Add company</Button>} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[['all', 'All'], ['active', 'Active'], ['pending', 'Pending'], ['suspended', 'Suspended'], ['deactivated', 'Deactivated']].map(([value, label]) => ({ value, label, count: value === 'all' ? db.companies.length : db.companies.filter((c) => c.status === value).length }))} />
      <DataTable
        rows={rows}
        onRowClick={(r) => setView(r.id)}
        columns={[
          { key: 'name', label: 'Company', render: (c) => <div className="flex items-center gap-3">{c.logo ? <img src={c.logo} alt="" className="h-9 w-9 rounded-xl object-cover" /> : <Avatar name={c.name} size="sm" />}<div><p className="font-bold">{c.name}</p><p className="text-xs text-slate-500">{c.industry} · {c.city}</p></div></div> },
          { key: 'status', label: 'Status', render: (c) => <Badge tone={STATUS[c.status][0]}>{STATUS[c.status][1]}</Badge> },
          { key: 'events', label: 'Events', hideOnMobile: true },
          { key: 'gross', label: 'Sales', render: (c) => money(c.w.gross), sort: (c) => c.w.gross },
          { key: 'commissionPct', label: 'Commission', render: (c) => `${c.commissionPct}%`, hideOnMobile: true },
          { key: 'available', label: 'Wallet', render: (c) => money(c.w.available), sort: (c) => c.w.available, hideOnMobile: true },
          { key: 'createdAt', label: 'Joined', render: (c) => fmtDate(c.createdAt), hideOnMobile: true },
        ]}
      />
      <Modal
        open={!!company}
        onClose={() => setView(null)}
        title={company?.name}
        subtitle={`${company?.industry} · ${company?.city}`}
        size="lg"
        footer={
          company && (
            <>
              {company.status !== 'active' && <Button icon={company.status === 'pending' ? BadgeCheck : RotateCcw} onClick={() => setStatus(company, 'active')}>{company.status === 'pending' ? 'Verify & activate' : 'Reactivate'}</Button>}
              {company.status !== 'suspended' && <Button variant="soft-red" icon={Ban} onClick={() => setStatus(company, 'suspended')}>Suspend</Button>}
            </>
          )
        }
      >
        {company && (
          <div className="space-y-6">
            <KeyValue items={[['Status', STATUS[company.status][1]], ['KYC', company.kyc], ['Email', company.email], ['Phone', company.phone], ['Registration no.', company.kycDocs?.regNo || 'On file'], ['Director Ghana Card', company.kycDocs?.ghanaCard || 'On file'], ['Payout', destinationLabel(company.payout)], ['Joined', fmtDate(company.createdAt)]]} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[['Gross', w.gross], ['Commission', w.commission], ['Paid out', w.paidOut], ['Available', w.available]].map(([l, v]) => (
                <div key={l} className="rounded-2xl bg-slate-50 p-3 dark:bg-white/5"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{l}</p><p className="font-extrabold">{money(v)}</p></div>
              ))}
            </div>
            <Field label="Commission on paid votes (%)" hint="Applies to new payments from now on" className="max-w-xs">
              <Input type="number" min={0} max={50} step={0.5} value={company.commissionPct} onChange={(e) => db.update('companies', company.id, { commissionPct: Number(e.target.value) })} onBlur={() => db.log('Commission changed', `${company.name}: ${company.commissionPct}%`, { companyId: company.id })} />
            </Field>
            <div>
              <p className="label">Organisers & judges</p>
              <div className="flex flex-wrap gap-2">
                {db.users.filter((u) => u.companyId === company.id).map((u) => <Badge key={u.id} tone={u.role === 'judge' ? 'violet' : 'blue'}>{u.name} · {u.role}</Badge>)}
              </div>
            </div>
            {company.status === 'pending' && <p className="flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"><FileCheck2 className="h-4 w-4" /> Check the registration and Ghana Card numbers before verifying.</p>}
          </div>
        )}
      </Modal>
      <FormModal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a company"
        subtitle="Creates a verified company and (optionally) its first organiser login."
        submitLabel="Add company"
        initial={{ commissionPct: db.settings.defaultCommission, industry: 'Entertainment' }}
        fields={[
          { name: 'name', label: 'Company name', required: true, span: 2 },
          { name: 'industry', label: 'Industry' },
          { name: 'city', label: 'City', required: true },
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'phone', label: 'Phone', type: 'tel', required: true },
          { name: 'commissionPct', label: 'Commission %', type: 'number' },
          { name: 'ownerName', label: 'Organiser name' },
          { name: 'ownerEmail', label: 'Organiser email', type: 'email' },
        ]}
        onSubmit={create}
      />
    </>
  );
}
