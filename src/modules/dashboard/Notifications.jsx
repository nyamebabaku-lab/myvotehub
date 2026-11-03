import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useDB } from '../../data/store';
import { useCurrentUser, notificationsFor } from '../../data/selectors';
import { fmtDateTime } from '../../lib/format';
import { Button, Card, EmptyState, PageHeader, cx } from '../../components/ui';

export default function Notifications() {
  const user = useCurrentUser();
  const all = useDB((s) => s.notifications);
  const markRead = useDB((s) => s.markRead);
  const list = notificationsFor(user, all);
  const unread = list.filter((n) => !n.read);
  return (
    <>
      <PageHeader title="Notifications" subtitle={`${unread.length} unread`} actions={unread.length > 0 && <Button variant="secondary" icon={CheckCheck} onClick={() => markRead(unread.map((n) => n.id))}>Mark all read</Button>} />
      <Card className="divide-y divide-slate-100 dark:divide-white/5">
        {list.map((n) => (
          <Link key={n.id} to={n.link || '#'} onClick={() => markRead([n.id])} className={cx('flex items-start gap-4 p-4 transition hover:bg-slate-50 dark:hover:bg-white/[.03]', !n.read && 'bg-brand-50/40 dark:bg-brand-500/5')}>
            <span className={cx('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', n.read ? 'bg-slate-100 text-slate-400 dark:bg-white/5' : 'bg-brand-600 text-white')}>
              <Bell className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800 dark:text-white">{n.title}</p>
              <p className="text-sm text-slate-500">{n.text}</p>
            </div>
            <span className="whitespace-nowrap text-xs text-slate-400">{fmtDateTime(n.at)}</span>
          </Link>
        ))}
        {!list.length && <EmptyState icon={Bell} title="You're all caught up" />}
      </Card>
    </>
  );
}
