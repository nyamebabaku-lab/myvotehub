import { UserCheck, LayoutDashboard, Building2, CalendarCheck2, CalendarRange, Wallet, Receipt, ScrollText, Settings, Users, Gavel, Bell, ShieldCheck } from 'lucide-react';

export const ROLES = {
  admin: { label: 'Super Admin' },
  organiser: { label: 'Event Organiser' },
  judge: { label: 'Judge' },
};

const NAV = {
  admin: [
    { group: 'Platform', items: [
      { key: 'dashboard', label: 'Overview', path: '/app', icon: LayoutDashboard },
      { key: 'accounts', label: 'Accounts', path: '/app/accounts', icon: UserCheck },
      { key: 'companies', label: 'Companies', path: '/app/companies', icon: Building2 },
      { key: 'approvals', label: 'Event approvals', path: '/app/approvals', icon: ShieldCheck },
      { key: 'events', label: 'All events', path: '/app/events', icon: CalendarRange },
    ] },
    { group: 'Money', items: [
      { key: 'withdrawals', label: 'Withdrawals', path: '/app/withdrawals', icon: Wallet },
      { key: 'transactions', label: 'Transactions', path: '/app/transactions', icon: Receipt },
    ] },
    { group: 'System', items: [
      { key: 'notifications', label: 'Notifications', path: '/app/notifications', icon: Bell },
      { key: 'audit', label: 'Audit log', path: '/app/audit', icon: ScrollText },
      { key: 'settings', label: 'Settings', path: '/app/settings', icon: Settings },
    ] },
  ],
  organiser: [
    { group: 'Events', items: [
      { key: 'dashboard', label: 'Overview', path: '/app', icon: LayoutDashboard },
      { key: 'events', label: 'My events', path: '/app/events', icon: CalendarCheck2 },
      { key: 'team', label: 'Team & judges', path: '/app/team', icon: Users },
    ] },
    { group: 'Money', items: [
      { key: 'wallet', label: 'Wallet', path: '/app/wallet', icon: Wallet },
      { key: 'transactions', label: 'Transactions', path: '/app/transactions', icon: Receipt },
    ] },
    { group: 'Account', items: [
      { key: 'notifications', label: 'Notifications', path: '/app/notifications', icon: Bell },
      { key: 'company', label: 'Company profile', path: '/app/company', icon: Building2 },
    ] },
  ],
  judge: [
    { group: 'Judging', items: [
      { key: 'dashboard', label: 'Overview', path: '/app', icon: LayoutDashboard },
      { key: 'judging', label: 'Score nominees', path: '/app/judging', icon: Gavel },
      { key: 'notifications', label: 'Notifications', path: '/app/notifications', icon: Bell },
    ] },
  ],
};

export const navFor = (role) => NAV[role] || [];
export const canAccess = (role, key) => navFor(role).some((g) => g.items.some((i) => i.key === key));
export const MOBILE_TABS = {
  admin: ['dashboard', 'accounts', 'approvals', 'withdrawals'],
  organiser: ['dashboard', 'events', 'wallet', 'transactions'],
  judge: ['dashboard', 'judging', 'notifications'],
};
export const navItem = (role, key) => navFor(role).flatMap((g) => g.items).find((i) => i.key === key);
