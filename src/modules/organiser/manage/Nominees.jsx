import { useState } from 'react';
import { Plus, Pencil, Trash2, UserX, Undo2, ListPlus } from 'lucide-react';
import { useDB } from '../../../data/store';
import { useTally } from '../../../data/selectors';
import { categoryCode, nextNomineeCode } from '../../../lib/events';
import { evict, reinstate } from '../../../lib/eviction';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal, Select, Textarea, confirmDialog, toast } from '../../../components/ui';
import { ImagePicker, NomineePhoto } from '../../../components/event';

export default function Nominees({ event }) {
  const db = useDB();
  const tally = useTally(event);
  const cats = db.categories.filter((c) => c.eventId === event.id).sort((a, b) => a.order - b.order);
  const noms = db.nominees.filter((n) => n.eventId === event.id);
  const [edit, setEdit] = useState(null); // nominee draft
  const [catEdit, setCatEdit] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [evicting, setEvicting] = useState(null);
  const hasVotes = (pred) => db.votes.some((v) => v.eventId === event.id && pred(v));

  const saveCat = () => {
    if (!catEdit.name.trim()) return toast.error('Name the category');
    if (catEdit.id) db.update('categories', catEdit.id, { name: catEdit.name.trim(), description: catEdit.description });
    else db.add('categories', { eventId: event.id, name: catEdit.name.trim(), description: catEdit.description || '', code: categoryCode(catEdit.name, cats.map((c) => c.code)), order: cats.length });
    setCatEdit(null);
  };
  const delCat = async (c) => {
    if (hasVotes((v) => v.categoryId === c.id)) return toast.error('This category has votes', 'Categories with votes cannot be deleted.');
    if (!(await confirmDialog(`Delete “${c.name}”?`, 'Its nominees will be removed too.'))) return;
    noms.filter((n) => n.categoryId === c.id).forEach((n) => db.remove('nominees', n.id));
    db.remove('categories', c.id);
  };
  const saveNom = () => {
    if (!edit.name.trim()) return toast.error('Enter the nominee’s name');
    const { id, ...rest } = edit;
    if (id) db.update('nominees', id, rest);
    else {
      const cat = cats.find((c) => c.id === edit.categoryId);
      db.add('nominees', { ...rest, eventId: event.id, code: nextNomineeCode(cat, db.nominees), status: 'active' });
    }
    toast.success('Nominee saved', edit.name);
    setEdit(null);
  };
  const delNom = async (n) => {
    if (hasVotes((v) => v.nomineeId === n.id)) return toast.error('This nominee has votes', 'Evict them instead of deleting.');
    if (await confirmDialog(`Remove ${n.name}?`, 'This cannot be undone.')) db.remove('nominees', n.id);
  };
  const saveBulk = () => {
    const cat = cats.find((c) => c.id === bulk.categoryId);
    const names = bulk.text.split('\n').map((x) => x.trim()).filter(Boolean);
    let list = [...db.nominees];
    names.forEach((name) => {
      const rec = db.add('nominees', { eventId: event.id, categoryId: cat.id, name, bio: '', photo: null, status: 'active', code: nextNomineeCode(cat, list) });
      list = [...list, rec];
    });
    toast.success(`${names.length} nominees added`, cat.name);
    setBulk(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" icon={Plus} onClick={() => setCatEdit({ name: '', description: '' })}>Add category</Button>
      </div>
      {cats.map((c) => {
        const list = noms.filter((n) => n.categoryId === c.id).sort((a, b) => a.code.localeCompare(b.code));
        return (
          <Card key={c.id} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/5">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white">{c.name} <span className="ml-1 font-mono text-xs text-slate-400">{c.code}</span></h3>
                <p className="text-xs text-slate-500">{list.length} nominees</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="soft" icon={Plus} onClick={() => setEdit({ categoryId: c.id, name: '', bio: '', photo: null })}>Nominee</Button>
                <Button size="sm" variant="ghost" icon={ListPlus} onClick={() => setBulk({ categoryId: c.id, text: '' })}>Bulk add</Button>
                <IconButton icon={Pencil} label="Rename category" onClick={() => setCatEdit({ ...c })} />
                <IconButton icon={Trash2} label="Delete category" onClick={() => delCat(c)} />
              </div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {list.map((n) => (
                <div key={n.id} className="flex items-center gap-3 px-5 py-3">
                  <NomineePhoto nominee={n} className="h-11 w-11" rounded="rounded-xl" text="text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-800 dark:text-white">{n.name}</p>
                    <p className="text-xs text-slate-500"><span className="font-mono">{n.code}</span> · {(tally[n.id] || 0).toLocaleString()} votes{event.rounds && ' this round'}</p>
                  </div>
                  {n.status === 'evicted' && <Badge tone="red">Evicted{n.evictedRound ? ` · R${n.evictedRound}` : ''}</Badge>}
                  <div className="flex items-center">
                    <IconButton icon={Pencil} label="Edit" onClick={() => setEdit({ ...n })} />
                    {n.status === 'evicted' ? (
                      <IconButton icon={Undo2} label="Reinstate" onClick={async () => (await confirmDialog(`Reinstate ${n.name}?`, 'They return to the competition.', { danger: false, confirmLabel: 'Reinstate' })) && reinstate(event, n)} />
                    ) : (
                      <IconButton icon={UserX} label="Evict" tone="soft-red" onClick={() => setEvicting({ nominee: n, reason: '' })} />
                    )}
                    <IconButton icon={Trash2} label="Delete" onClick={() => delNom(n)} />
                  </div>
                </div>
              ))}
              {!list.length && <p className="px-5 py-6 text-sm text-slate-400">No nominees yet.</p>}
            </div>
          </Card>
        );
      })}
      {!cats.length && <Card><EmptyState title="No categories" text="Add a category, then its nominees." action={<Button icon={Plus} onClick={() => setCatEdit({ name: '' })}>Add category</Button>} /></Card>}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit nominee' : 'Add nominee'} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={saveNom}>Save</Button></>}>
        {edit && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <NomineePhoto nominee={edit.name ? edit : { ...edit, name: '?' }} className="h-20 w-20" />
              <ImagePicker value={edit.photo} onChange={(photo) => setEdit({ ...edit, photo })} max={420} label="Upload photo" />
            </div>
            <Field label="Name *"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Category"><Select value={edit.categoryId} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })} options={cats.map((c) => ({ value: c.id, label: c.name }))} /></Field>
            <Field label="Short bio"><Textarea value={edit.bio || ''} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} placeholder="Shown on the nominee page" /></Field>
          </div>
        )}
      </Modal>
      <Modal open={!!catEdit} onClose={() => setCatEdit(null)} title={catEdit?.id ? 'Rename category' : 'Add category'} size="sm" footer={<><Button variant="secondary" onClick={() => setCatEdit(null)}>Cancel</Button><Button onClick={saveCat}>Save</Button></>}>
        {catEdit && <Field label="Category name"><Input autoFocus value={catEdit.name} onChange={(e) => setCatEdit({ ...catEdit, name: e.target.value })} /></Field>}
      </Modal>
      <Modal open={!!bulk} onClose={() => setBulk(null)} title="Bulk add nominees" subtitle="One name per line" footer={<><Button variant="secondary" onClick={() => setBulk(null)}>Cancel</Button><Button onClick={saveBulk}>Add</Button></>}>
        {bulk && <Textarea className="min-h-[200px]" value={bulk.text} onChange={(e) => setBulk({ ...bulk, text: e.target.value })} placeholder={'Ama Serwaa\nKojo Mensah'} />}
      </Modal>
      <Modal
        open={!!evicting}
        onClose={() => setEvicting(null)}
        title={`Evict ${evicting?.nominee.name}?`}
        subtitle="They stop receiving votes and are shown as evicted."
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setEvicting(null)}>Cancel</Button><Button variant="danger" icon={UserX} onClick={() => { evict(event, evicting.nominee, evicting.reason || 'Evicted by organiser'); toast.success('Nominee evicted', evicting.nominee.name); setEvicting(null); }}>Evict</Button></>}
      >
        {evicting && <Field label="Reason (shown in the eviction log)"><Input value={evicting.reason} onChange={(e) => setEvicting({ ...evicting, reason: e.target.value })} placeholder="e.g. Rule violation / lowest votes" /></Field>}
      </Modal>
    </div>
  );
}
