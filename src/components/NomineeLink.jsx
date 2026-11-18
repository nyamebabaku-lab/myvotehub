// Organiser tool: the private dashboard link a nominee uses to watch their own votes.
import { useEffect, useState } from 'react';
import { Copy, RefreshCw, Share2, MessageCircle } from 'lucide-react';
import { supabase, must } from '../lib/supabase';
import { publicUrl, shareLink } from '../lib/share';
import { Button, Modal, confirmDialog, toast } from './ui';
import { QRCode } from './QR';

export default function NomineeLink({ nominee, onClose }) {
  const [token, setToken] = useState(null);
  useEffect(() => {
    if (!nominee) return;
    setToken(null);
    supabase.rpc('nominee_link', { nid: nominee.id }).then((r) => {
      try {
        setToken(must(r));
      } catch (e) {
        toast.error('Could not get the link', e.message);
      }
    });
  }, [nominee]);
  const url = token ? publicUrl(`/me/${token}`) : '';
  const reset = async () => {
    if (!(await confirmDialog('Reset this link?', `The old link stops working at once. Send ${nominee.name} the new one.`, { confirmLabel: 'Reset link' }))) return;
    try {
      setToken(must(await supabase.rpc('reset_nominee_link', { nid: nominee.id })));
      toast.success('New link created');
    } catch (e) {
      toast.error('Could not reset', e.message);
    }
  };
  const text = `Hi ${nominee?.name}! Watch your MyVoteHub votes live here (keep this link private): ${url}`;
  return (
    <Modal open={!!nominee} onClose={onClose} title={`${nominee?.name}'s vote dashboard`} subtitle="A private link: the nominee sees their own total, today’s votes and position. No account needed." size="sm"
      footer={<><Button variant="soft-red" icon={RefreshCw} onClick={reset} disabled={!token}>Reset link</Button><Button icon={Share2} onClick={() => shareLink(url, `${nominee?.name} — my votes`)} disabled={!token}>Share</Button></>}>
      {token ? (
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl bg-white p-2 ring-1 ring-slate-200"><QRCode value={url} size={170} /></div>
          <div className="flex w-full items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-white/5">{url}</code>
            <Button variant="secondary" size="sm" icon={Copy} onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success('Link copied'))}>Copy</Button>
          </div>
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white hover:bg-emerald-600">
            <MessageCircle className="h-4 w-4" /> Send on WhatsApp
          </a>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-slate-400">Getting the link…</p>
      )}
    </Modal>
  );
}
