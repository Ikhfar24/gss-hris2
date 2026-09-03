'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getUser, clearSession, SessionUser } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import RoleGate from '@/components/RoleGate';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  async function logout() {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSession();
    router.push('/login');
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="mb-6 text-lg font-semibold">Papaiz HR</div>
        <nav className="flex flex-col gap-1 text-sm">
          <Link href="/dashboard" className="rounded-lg px-3 py-2 hover:bg-slate-100">
            Dashboard
          </Link>
          <Link href="/attendance" className="rounded-lg px-3 py-2 hover:bg-slate-100">
            Absensi
          </Link>
          <Link href="/leave-requests" className="rounded-lg px-3 py-2 hover:bg-slate-100">
            Cuti, Izin & Resign
          </Link>
          <RoleGate allow={['ADMIN_HR', 'SYSTEM_ADMIN', 'KEUANGAN', 'DIREKTUR', 'KARYAWAN']}>
            <Link href="/payroll" className="rounded-lg px-3 py-2 hover:bg-slate-100">
              Payroll
            </Link>
          </RoleGate>
          <RoleGate allow={['ADMIN_HR', 'SYSTEM_ADMIN', 'KOORDINATOR', 'DIREKTUR']}>
            <Link href="/employees" className="rounded-lg px-3 py-2 hover:bg-slate-100">
              Data Karyawan
            </Link>
          </RoleGate>
          <RoleGate allow={['ADMIN_HR', 'SYSTEM_ADMIN', 'KOORDINATOR', 'DIREKTUR']}>
            <Link href="/placement-requests" className="rounded-lg px-3 py-2 hover:bg-slate-100">
              Pengajuan Penempatan
            </Link>
          </RoleGate>
          <RoleGate allow={['ADMIN_HR', 'SYSTEM_ADMIN', 'KOORDINATOR', 'DIREKTUR']}>
            <Link href="/locations" className="rounded-lg px-3 py-2 hover:bg-slate-100">
              Lokasi Kerja
            </Link>
          </RoleGate>
          <RoleGate allow={['ADMIN_HR', 'SYSTEM_ADMIN', 'KOORDINATOR', 'DIREKTUR']}>
            <Link href="/clients" className="rounded-lg px-3 py-2 hover:bg-slate-100">
              Client
            </Link>
          </RoleGate>
          <RoleGate allow={['ADMIN_HR', 'SYSTEM_ADMIN', 'KOORDINATOR', 'DIREKTUR']}>
            <Link href="/holidays" className="rounded-lg px-3 py-2 hover:bg-slate-100">
              Hari Libur & Kalender
            </Link>
          </RoleGate>
          <RoleGate allow={['ADMIN_HR', 'SYSTEM_ADMIN', 'KOORDINATOR', 'DIREKTUR']}>
            <Link href="/reports" className="rounded-lg px-3 py-2 hover:bg-slate-100">
              Laporan
            </Link>
          </RoleGate>
          <RoleGate allow={['ADMIN_HR', 'SYSTEM_ADMIN']}>
            <Link href="/devices" className="rounded-lg px-3 py-2 hover:bg-slate-100">
              Perangkat Terikat
            </Link>
          </RoleGate>
          <RoleGate allow={['ADMIN_HR', 'SYSTEM_ADMIN', 'DIREKTUR']}>
            <Link href="/users" className="rounded-lg px-3 py-2 hover:bg-slate-100">
              Manajemen User
            </Link>
          </RoleGate>
          <RoleGate allow={['ADMIN_HR', 'SYSTEM_ADMIN']}>
            <Link href="/settings" className="rounded-lg px-3 py-2 hover:bg-slate-100">
              Company Settings
            </Link>
          </RoleGate>
        </nav>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm text-slate-500">{user?.email}</div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
              {user?.role}
            </span>
            <button onClick={logout} className="text-sm text-slate-500 hover:text-slate-900">
              Keluar
            </button>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
