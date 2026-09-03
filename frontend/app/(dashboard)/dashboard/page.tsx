'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken, getUser, SessionUser } from '@/lib/auth';

interface DashboardSummary {
  date: string;
  attendance: { hadir: number; terlambat: number; tidakHadir: number; perluDitinjau: number };
  pendingLeaveRequests: number;
  pendingPlacementRequests: number;
  activePlacements: number;
}

export default function DashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  if (user?.role === 'KARYAWAN') return <KaryawanHome />;
  return <OperationalDashboard />;
}

function KaryawanHome() {
  const user = getUser();
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Selamat datang{user ? `, ${user.email}` : ''}</h1>
      <p className="mb-4 text-sm text-slate-500">
        Gunakan menu <strong>Absensi</strong> untuk check-in/check-out, atau{' '}
        <strong>Cuti, Izin & Resign</strong> untuk mengajukan cuti/izin.
      </p>
      <div className="flex gap-3">
        <Link href="/attendance" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
          Absensi Hari Ini
        </Link>
        <Link href="/leave-requests" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
          Ajukan Cuti/Izin
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// §14 Dashboard HR/Koordinator/Direktur — operational summary + drill-down
// ---------------------------------------------------------------------
function OperationalDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const role = getUser()?.role;
  const isKoordinator = role === 'KOORDINATOR';

  async function load() {
    try {
      const data = await apiFetch<DashboardSummary>('/dashboard/summary', { token: getToken() });
      setSummary(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat ringkasan dashboard');
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Dashboard {isKoordinator ? 'Tim Anda' : 'Operasional'}</h1>
      <p className="mb-4 text-sm text-slate-500">
        {summary ? new Date(summary.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}
      </p>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {summary && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">HARI INI</h2>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Hadir" value={summary.attendance.hadir} style="text-green-600" href="/attendance" />
            <StatCard label="Terlambat" value={summary.attendance.terlambat} style="text-yellow-600" href="/attendance" />
            <StatCard label="Tidak Hadir" value={summary.attendance.tidakHadir} style="text-red-600" href="/attendance" />
            <StatCard label="Verifikasi Gagal" value={summary.attendance.perluDitinjau} style="text-blue-600" href="/attendance" />
          </div>

          <h2 className="mb-2 text-sm font-semibold text-slate-500">MENUNGGU TINDAKAN</h2>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Pengajuan Cuti/Izin Pending" value={summary.pendingLeaveRequests} style="text-slate-900" href="/leave-requests" />
            <StatCard label="Pengajuan Penempatan Pending" value={summary.pendingPlacementRequests} style="text-slate-900" href="/placement-requests" />
            <StatCard label="Penempatan Aktif" value={summary.activePlacements} style="text-slate-900" href="/employees" />
          </div>

          <Link href="/reports" className="text-sm font-medium text-slate-700 underline">
            Lihat & unduh laporan lengkap →
          </Link>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, style, href }: { label: string; value: number; style: string; href: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300">
      <div className={`text-2xl font-semibold ${style}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </Link>
  );
}
