// Every account on the platform: approve, suspend, activate, deactivate or delete.
import { useEffect, useState } from 'react';
import { supabase, must } from '../../lib/supabase';
import { CheckCircle2, Ban, Power, PowerOff, Trash2, Crown, ShieldCheck, Gavel, Users, Building2, KeyRound, Copy, LifeBuoy, RefreshCw } from 'lucide-react';
import { useDB } from '../../data/store';
import { useCurrentUser } from '../../data/selectors';
import { LIVE } from '../../config';
import { fmtDateTime } from '../../lib/format';
import { STATUS, setAccountStatus, deleteAccount, setAdminRole, adminResetPassword, tempPassword } from '../../lib/accounts';
import { Avatar, Badge, Button, DataTable, EmptyState, Field, IconButton, Modal, PageHeader, StatCard, Tabs, Textarea, confirmDialog, toast } from '../../components/ui';

const ROLE = { admin: ['red', 'Admin', ShieldCheck], organiser: ['blue', 'Organiser', Users], judge: ['violet', 'Judge', Gavel] };
// Demo build has no server: change the local record instead.
const statusOf = (u) => u.status || 'active';

export default function Accounts() {
  const db = useDB();
  const me = useCurrentUser();
  const [tab, setTab] = useState('pending');
  const [role, setRole] = useState('all');
  const [act, setAct] = useState(null); // { user, status, reason }
  const [reset, setReset] = useState(null); // { user, temp, done }
  const [help, setHelp] = useState([]);
  const loadHelp = async () => LIVE && setHelp(must(await supabase.from('password_help').select('*').eq('handled', false).order('created_at', { ascending: false })));
  useEffect(() => {
    loadHelp().catch(() => {});
  }, []);
  const doReset = async () => {
    try {
      await adminResetPassword(reset.user.id, reset.temp);
      setReset({ ...reset, done: true });
      loadHelp();
    } catch (e) {
      toast.error('Could not reset the password', e.message);
    }
  };
  const users = db.users;
  const company = (id) => db.companies.find((c) => c.id === id);
  const canManage = (u) => u.id !== me.id && (u.role !== 'admin' || me.super || !LIVE);
  const rows = users.filter((u) => (tab === 'all' || statusOf(u) === tab) && (role === 'all' || u.role === role));
  const count = (s) => users.filter((u) => statusOf(u) === s).length;

  const run = async (fn, ok) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error('Could not update the account', e.message);
    }
  };
  const apply = () => {
    const { user, status, reason } = act;
    setAct(null);
    run(async () => {
      if (LIVE) await setAccountStatus(user.id, status, reason);
      else db.update('users', user.id, { status, statusReason: reason });
    }, `${user.name}: ${STATUS[status].label}`);
  };
  const remove = async (u) => {
    if (!(await confirmDialog(`Delete ${u.name}?`, `${u.email} is removed permanently and can no longer sign in. Their company and events stay.`, { confirmLabel: 'Delete account' }))) return;
    run(async () => (LIVE ? deleteAccount(u.id) : db.remove('users', u.id)), 'Account deleted');
  };
  const toggleSuper = async (u) => {
    if (!(await confirmDialog(u.super ? `Remove Super Admin from ${u.name}?` : `Make ${u.name} a Super Admin?`, u.super ? 'They stay an admin but can no longer manage other admins.' : 'Super Admins can approve, suspend and delete other admins.', { danger: !!u.super, confirmLabel: 'Confirm' }))) return;
    run(async () => (LIVE ? setAdminRole(u.id, !u.super) : db.update('users', u.id, { super: !u.super })), 'Role updated');
  };

  const actions = (u) => {
    if (!canManage(u)) return <span className="text-xs text-slate-400">{u.id === me.id ? 'You' : 'Super Admin only'}</span>;
    const s = statusOf(u);
    return (
      <div className="flex items-center justify-end gap-1">
        {s === 'pending' && <Button size="sm" icon={CheckCircle2} onClick={() => setAct({ user: u, status: 'active', reason: '' })}>Approve</Button>}
        {(s === 'suspended' || s === 'deactivated') && <Button size="sm" variant="soft" icon={Power} onClick={() => setAct({ user: u, status: 'active', reason: '' })}>Activate</Button>}
        {s !== 'suspended' && s !== 'pending' && <IconButton icon={Ban} label="Suspend" tone="soft-red" onClick={() => setAct({ user: u, status: 'suspended', reason: '' })} />}
        {s === 'pending' && <IconButton icon={Ban} label="Reject (suspend)" tone="soft-red" onClick={() => setAct({ user: u, status: 'suspended', reason: '' })} />}
        {s !== 'deactivated' && <IconButton icon={PowerOff} label="Deactivate" onClick={() => setAct({ user: u, status: 'deactivated', reason: '' })} />}
        {LIVE && <IconButton icon={KeyRound} label="Reset password" onClick={() => setReset({ user: u, temp: tempPassword(), done: false })} />}
        {u.role === 'admin' && me.super && <IconButton icon={Crown} label={u.super ? 'Remove Super Admin' : 'Make Super Admin'} onClick={() => toggleSuper(u)} />}
        <IconButton icon={Trash2} label="Delete" onClick={() => remove(u)} />
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Accounts" subtitle="Every organiser, team member, judge and admin needs approval before they can use MyVoteHub." />
      {help.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="flex items-center gap-2 font-bold"><LifeBuoy className="h-4 w-4" /> {help.length} {help.length === 1 ? 'person needs' : 'people need'} password help</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {help.map((h) => {
              const u = users.find((x) => x.email?.toLowerCase() === h.email);
              return (
                <button key={h.id} onClick={() => u && setReset({ user: u, temp: tempPassword(), done: false })} className="rounded-xl bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm hover:bg-amber-100 dark:bg-white/10 dark:text-white">
                  {u?.name || h.email} · {fmtDateTime(h.created_at)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs">Check it’s really them (call or WhatsApp), then set a temporary password. They choose a new one when they sign in.</p>
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Waiting for approval" value={count('pending')} icon={CheckCircle2} tone="amber" onClick={() => setTab('pending')} />
        <StatCard label="Active" value={count('active')} icon={Power} tone="green" onClick={() => setTab('active')} />
        <StatCard label="Suspended" value={count('suspended')} icon={Ban} tone="red" onClick={() => setTab('suspended')} />
        <StatCard label="Deactivated" value={count('deactivated')} icon={PowerOff} tone="violet" onClick={() => setTab('deactivated')} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={setTab} tabs={[['pending', 'Pending'], ['active', 'Active'], ['suspended', 'Suspended'], ['deactivated', 'Deactivated'], ['all', 'All']].map(([value, label]) => ({ value, label, count: value === 'all' ? users.length : count(value) }))} />
        <Tabs value={role} onChange={setRole} tabs={[['all', 'All roles'], ['organiser', 'Organisers'], ['judge', 'Judges'], ['admin', 'Admins']].map(([value, label]) => ({ value, label }))} />
      </div>
      <DataTable
        rows={rows}
        initialSort={{ key: 'createdAt', dir: 'desc' }}
        searchText={(u) => `${u.name} ${u.email} ${company(u.companyId)?.name || ''}`}
        empty={<EmptyState icon={CheckCircle2} title={tab === 'pending' ? 'Nobody is waiting for approval' : 'No accounts here'} />}
        columns={[
          { key: 'name', label: 'Account', render: (u) => <div className="flex items-center gap-3"><Avatar name={u.name} size="sm" /><div className="min-w-0"><p className="flex items-center gap-1.5 font-bold">{u.name}{u.super && <Crown className="h-3.5 w-3.5 text-amber-500" />}</p><p className="truncate text-xs text-slate-500">{u.email}</p></div></div> },
          { key: 'role', label: 'Role', render: (u) => { const [tone, l, Icon] = ROLE[u.role]; return <Badge tone={tone}><Icon className="h-3 w-3" /> {u.super ? 'Super Admin' : l}</Badge>; } },
          { key: 'company', label: 'Company', render: (u) => (u.companyId ? <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" />{company(u.companyId)?.name || '—'}{company(u.companyId)?.ownerId === u.id && <Badge tone="slate">Owner</Badge>}</span> : '—'), sort: (u) => company(u.companyId)?.name || '', hideOnMobile: true },
          { key: 'status', label: 'Status', render: (u) => <div><Badge tone={STATUS[statusOf(u)].tone}>{STATUS[statusOf(u)].label}</Badge>{u.statusReason && <p className="mt-1 max-w-[200px] truncate text-[11px] text-slate-500">{u.statusReason}</p>}</div>, sort: statusOf },
          { key: 'createdAt', label: 'Signed up', render: (u) => fmtDateTime(u.createdAt), hideOnMobile: true },
          { key: 'x', label: '', nosort: true, className: 'text-right', render: actions },
        ]}
      />
      <Modal
        open={!!reset}
        onClose={() => setReset(null)}
        title={reset && (reset.done ? 'Temporary password set' : `Reset ${reset.user.name}'s password?`)}
        subtitle={reset?.user.email}
        size="sm"
        footer={reset && (reset.done ? <Button onClick={() => setReset(null)}>Done</Button> : <><Button variant="secondary" onClick={() => setReset(null)}>Cancel</Button><Button icon={KeyRound} onClick={doReset}>Set temporary password</Button></>)}
      >
        {reset && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
              <code className="flex-1 text-center font-mono text-xl font-black tracking-wider">{reset.temp}</code>
              {!reset.done && <IconButton icon={RefreshCw} label="New suggestion" onClick={() => setReset({ ...reset, temp: tempPassword() })} />}
              <IconButton icon={Copy} label="Copy" onClick={() => navigator.clipboard?.writeText(reset.temp).then(() => toast.success('Copied'))} />
            </div>
            <p className="text-sm text-slate-500">{reset.done ? 'Send this to the user privately (call, SMS or WhatsApp). They must choose a new password as soon as they sign in with it.' : 'Their current password stops working. Only do this after confirming it’s really them.'}</p>
          </div>
        )}
      </Modal>
      <Modal
        open={!!act}
        onClose={() => setAct(null)}
        title={act && `${act.status === 'active' ? (statusOf(act.user) === 'pending' ? 'Approve' : 'Activate') : act.status === 'suspended' ? 'Suspend' : 'Deactivate'} ${act.user.name}?`}
        subtitle={act?.user.role === 'organiser' && company(act.user.companyId)?.ownerId === act.user.id && act.status === 'active' ? `This also approves ${company(act.user.companyId)?.name}.` : act?.user.email}
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setAct(null)}>Cancel</Button><Button variant={act?.status === 'active' ? 'primary' : 'danger'} onClick={apply}>Confirm</Button></>}
      >
        {act && <Field label={act.status === 'active' ? 'Note (optional)' : 'Reason (shown to the user)'}><Textarea value={act.reason} onChange={(e) => setAct({ ...act, reason: e.target.value })} placeholder={act.status === 'active' ? 'e.g. KYC checked' : 'e.g. Details could not be verified'} /></Field>}
      </Modal>
    </>
  );
}
