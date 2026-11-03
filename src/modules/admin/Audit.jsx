import { useDB } from '../../data/store';
import { fmtDateTime } from '../../lib/format';
import { Badge, DataTable, PageHeader } from '../../components/ui';

const tone = (a) => (/reject|suspend|evict|void|flag|delete/i.test(a) ? 'red' : /approv|paid|verif|releas/i.test(a) ? 'green' : 'blue');

export default function Audit() {
  const db = useDB();
  const rows = db.audit.map((a) => ({ ...a, who: db.users.find((u) => u.id === a.userId)?.name || 'System', company: db.companies.find((c) => c.id === a.companyId)?.name || '—' }));
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every important action, newest first. Kept for compliance and dispute resolution." />
      <DataTable
        rows={rows}
        pageSize={20}
        initialSort={{ key: 'at', dir: 'desc' }}
        searchText={(a) => `${a.action} ${a.detail} ${a.who} ${a.company}`}
        columns={[
          { key: 'at', label: 'When', render: (a) => fmtDateTime(a.at) },
          { key: 'action', label: 'Action', render: (a) => <Badge tone={tone(a.action)}>{a.action}</Badge> },
          { key: 'detail', label: 'Detail', render: (a) => <span className="block max-w-[420px] truncate">{a.detail}</span> },
          { key: 'who', label: 'By', hideOnMobile: true },
          { key: 'company', label: 'Company', hideOnMobile: true },
        ]}
      />
    </>
  );
}
