import type { LucideIcon } from 'lucide-react';
import { BarChart3, Bell, Building2, CalendarDays, CircleUserRound, ClipboardCheck, Clock3, Fingerprint, Gauge, MapPin, Settings, UsersRound, UserRoundCog, WalletCards } from 'lucide-react';
import type { Role, Session } from './session';

export interface NavigationItem { label: string; href: string; icon: LucideIcon; roles: readonly Role[]; requiresAttendance?: boolean; requiresEmployee?: boolean }
export interface NavigationGroup { label: string; items: NavigationItem[] }
const all: Role[] = ['KARYAWAN', 'KOORDINATOR', 'ADMIN_HR', 'KEUANGAN', 'MARKETING', 'DIREKTUR', 'KOMISARIS', 'SYSTEM_ADMIN'];
const ops: Role[] = ['KOORDINATOR', 'ADMIN_HR', 'SYSTEM_ADMIN'];

export const navigation: NavigationGroup[] = [
  { label: 'Ringkasan', items: [{ label: 'Dashboard', href: '/dashboard', icon: Gauge, roles: all }, { label: 'Pusat Aktivitas', href: '/activity', icon: Bell, roles: all }, { label: 'Profil Saya', href: '/profile', icon: CircleUserRound, roles: all }] },
  { label: 'Aktivitas', items: [
    { label: 'Presensi Saya', href: '/attendance?view=mine', icon: Fingerprint, roles: all, requiresAttendance: true },
    { label: 'Pengajuan', href: '/requests', icon: CalendarDays, roles: ['KARYAWAN'] },
    { label: 'Cuti, Izin & Resign', href: '/leave-requests', icon: CalendarDays, roles: ['KOORDINATOR', 'ADMIN_HR', 'KEUANGAN', 'MARKETING', 'DIREKTUR', 'SYSTEM_ADMIN'] },
    { label: 'Pengajuan Lembur', href: '/overtime-requests', icon: Clock3, roles: ['KARYAWAN', 'KOORDINATOR', 'ADMIN_HR', 'SYSTEM_ADMIN'] },
    { label: 'Kasus Ketidakhadiran', href: '/absence-cases', icon: ClipboardCheck, roles: ['KARYAWAN', ...ops] },
    { label: 'Perubahan Profil', href: '/profile-change-requests', icon: CircleUserRound, roles: ['KARYAWAN', 'ADMIN_HR', 'SYSTEM_ADMIN'] },
  ] },
  { label: 'Tenaga Kerja', items: [
    { label: 'Data Karyawan', href: '/employees', icon: UsersRound, roles: ['KOORDINATOR', 'ADMIN_HR', 'DIREKTUR', 'KOMISARIS', 'SYSTEM_ADMIN'] },
    { label: 'Pengajuan Penempatan', href: '/placement-requests', icon: MapPin, roles: ['KOORDINATOR', 'ADMIN_HR', 'DIREKTUR', 'SYSTEM_ADMIN'] },
    { label: 'Penugasan Sementara', href: '/temporary-assignments', icon: UserRoundCog, roles: ops },
    { label: 'Lokasi Kerja', href: '/locations', icon: MapPin, roles: ['KOORDINATOR', 'ADMIN_HR', 'DIREKTUR', 'SYSTEM_ADMIN'] },
    { label: 'Klien', href: '/clients', icon: Building2, roles: ['KOORDINATOR', 'ADMIN_HR', 'DIREKTUR', 'SYSTEM_ADMIN'] },
    { label: 'Hari Libur', href: '/holidays', icon: CalendarDays, roles: all },
  ] },
  { label: 'Kontrol', items: [
    { label: 'Payroll', href: '/payroll', icon: WalletCards, roles: ['ADMIN_HR', 'KEUANGAN', 'DIREKTUR'] },
    { label: 'Slip Gaji Saya', href: '/payroll?view=mine', icon: WalletCards, roles: all, requiresEmployee: true },
    { label: 'Laporan', href: '/reports', icon: BarChart3, roles: ['KOORDINATOR', 'ADMIN_HR', 'DIREKTUR', 'KOMISARIS', 'SYSTEM_ADMIN'] },
    { label: 'Manajemen User', href: '/users', icon: UserRoundCog, roles: ['ADMIN_HR', 'SYSTEM_ADMIN'] },
    { label: 'Pengaturan Perusahaan', href: '/settings', icon: Settings, roles: ['SYSTEM_ADMIN'] },
  ] },
];

export function canAttend(session: Session) {
  return !!session.employee && session.employee.status === 'ACTIVE' && session.employee.attendanceRequired && !!session.employee.activePlacementName;
}

export function mobileNavigation(session: Session): NavigationItem[] {
  const roleItems: Record<Role, NavigationItem[]> = {
    KARYAWAN: [item('Beranda', '/dashboard', Gauge), item('Pengajuan', '/requests', CalendarDays), item('Riwayat', '/attendance/history', Clock3), item('Profil', '/profile', CircleUserRound)],
    KOORDINATOR: [item('Beranda', '/dashboard', Gauge), item('Tim', '/employees', UsersRound), item('Aktivitas', '/activity', ClipboardCheck), item('Profil', '/profile', CircleUserRound)],
    ADMIN_HR: [item('Beranda', '/dashboard', Gauge), item('Karyawan', '/employees', UsersRound), item('Aktivitas', '/activity', ClipboardCheck), item('Profil', '/profile', CircleUserRound)],
    KEUANGAN: [item('Beranda', '/dashboard', Gauge), item('Payroll', '/payroll', WalletCards), item('Aktivitas', '/activity', ClipboardCheck), item('Profil', '/profile', CircleUserRound)],
    MARKETING: [item('Beranda', '/dashboard', Gauge), item('Pengajuan', '/leave-requests', CalendarDays), item('Riwayat', '/attendance/history', Clock3), item('Profil', '/profile', CircleUserRound)],
    DIREKTUR: [item('Beranda', '/dashboard', Gauge), item('Persetujuan', '/approvals', ClipboardCheck), item('Monitoring', '/reports', BarChart3), item('Aktivitas', '/activity', Clock3), item('Profil', '/profile', CircleUserRound)],
    KOMISARIS: [item('Beranda', '/dashboard', Gauge), item('Monitoring', '/reports', BarChart3), item('Aktivitas', '/activity', ClipboardCheck), item('Profil', '/profile', CircleUserRound)],
    SYSTEM_ADMIN: [item('Beranda', '/dashboard', Gauge), item('Sistem', '/system', Settings), item('Monitoring', '/reports', BarChart3), item('Aktivitas', '/activity', ClipboardCheck), item('Profil', '/profile', CircleUserRound)],
  };
  return roleItems[session.role];
}

function item(label: string, href: string, icon: LucideIcon): NavigationItem { return { label, href, icon, roles: all }; }
