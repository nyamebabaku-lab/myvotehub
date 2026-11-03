import { useState } from 'react';
import { UserPlus, Trash2, Gavel, Users } from 'lucide-react';
import { useDB } from '../../data/store';
import { useCurrentUser } from '../../data/selectors';
import { Avatar, Badge, Button, DataTable, FormModal, IconButton, PageHeader, confirmDialog, toast } from '../../components/ui';

export default function Team() {
  const user = useCurrentUser();
  const db = useDB();
  const [role, setRole] = useState(null);
  const people = db.users.filter((u) => u.companyId === user.companyId);
  const events = db.events.filter((e) => e.companyId === user.companyId);
  const add = (v) => {
    if (db.users.some((u) => u.email.toLowerCase() === v.email.toLowerCase())) return toast.error('Email already in use');
    db.add('users', { ...v, role, companyId: user.companyId, password: v.password || 'demo123', status: 'active' });
    db.log(role === 'judge' ? 'Judge invited' : 'Team member added', `${v.name} (${v.email})`, { companyId: user.companyId });
    toast.success(role === 'judge' ? 'Judge invited' : 'Team member added', `Sign in: ${v.email} / ${v.password || 'demo123'}`);
    setRole(null);
  };
  const remove = async (u) => {
    if (u.id === user.id) return toast.error('You cannot remove yourself');
    if (!(await confirmDialog(`Remove ${u.name}?`, 'They will no longer be able to sign in.'))) return;
    db.remove('users', u.id);
    events.filter((e) => e.judgeIds.includes(u.id)).forEach((e) => db.update('events', e.id, { judgeIds: e.judgeIds.filter((x) => x !== u.id) }));
  };
  return (
    <>
      <PageHeader title="Team & judges" subtitle="People who can manage your events or score nominees." actions={<><Button variant="secondary" icon={Gavel} onClick={() => setRole('judge')}>Invite judge</Button><Button icon={UserPlus} onClick={() => setRole('organiser')}>Add team member</Button></>} />
      <DataTable
        rows={people}
        columns={[
          { key: 'name', label: 'Name', render: (u) => <div className="flex items-center gap-3"><Avatar name={u.name} size="sm" /><div><p className="font-bold">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></div></div> },
          { key: 'role', label: 'Role', render: (u) => (u.role === 'judge' ? <Badge tone="violet"><Gavel className="h-3 w-3" /> Judge</Badge> : <Badge tone="blue"><Users className="h-3 w-3" /> Organiser</Badge>) },
          { key: 'title', label: 'Title', hideOnMobile: true },
          { key: 'events', label: 'Judging', render: (u) => (u.role === 'judge' ? events.filter((e) => e.judgeIds.includes(u.id)).map((e) => e.title).join(', ') || '—' : '—'), hideOnMobile: true, nosort: true },
          { key: 'x', label: '', nosort: true, render: (u) => <IconButton icon={Trash2} label="Remove" onClick={() => remove(u)} /> },
        ]}
      />
      <FormModal
        open={!!role}
        onClose={() => setRole(null)}
        title={role === 'judge' ? 'Invite a judge' : 'Add a team member'}
        subtitle={role === 'judge' ? 'Judges only see their own scoring sheets.' : 'Team members can manage all your events and request withdrawals.'}
        size="md"
        submitLabel="Add"
        fields={[
          { name: 'name', label: 'Full name', required: true },
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'title', label: 'Title', placeholder: role === 'judge' ? 'e.g. Music Producer' : 'e.g. Finance Officer' },
          { name: 'password', label: 'Temporary password', placeholder: 'demo123' },
        ]}
        onSubmit={add}
      />
    </>
  );
}
