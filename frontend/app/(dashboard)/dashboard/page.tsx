'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken, getUser, SessionUser } from '@/lib/auth';

interface DashboardSummary {
  date?: string;
  attendance?: { hadir: number; terlambat: number; tidakHadir: number; perluDitinjau: number };
  pendingLeaveRequests?: number;
  pendingPlacementRequests?: number;
  activePlacements?: number;
}

interface AttentionCard {
  key: string;
  label: string;
  count: number;
  href: string;
}

const OPERATIONAL_ROLES = ['KARYAWAN', 'KOORDINATOR', 'ADMIN_HR', 'SYSTEM_ADMIN'];
const LEAVE_SUMMARY_ROLES = [...OPERATIONAL_ROLES, 'DIREKTUR'];
const PLACEMENT_SUMMARY_ROLES = ['ADMIN_HR', 'SYSTEM_ADMIN', 'DIREKTUR'];
const REPORT_ROLES = ['ADMIN_HR', 'SYSTEM_ADMIN', 'KOORDINATOR', 'DIREKTUR', 'KOMISARIS'];

export default function DashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authResolved, setAuthResolved] = useState(false);

  useEffect(() => {
    setUser(getUser());
    setAuthResolved(true);
  }, []);

  return <Dashboard user={user} authResolved={authResolved} />;
}

function Dashboard({ user, authResolved }: { user: SessionUser | null; authResolved: boolean }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [attention, setAttention] = useState<AttentionCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const role = authResolved ? user?.role : undefined;
  const isKoordinator = role === 'KOORDINATOR';
  const [employee, setEmployee] = useState<{ attendanceRequired: boolean; status: string; placements?: { status: string }[] } | null>(null);
  const hasSelfAttendance = authResolved && !!employee && employee.attendanceRequired && employee.status === 'ACTIVE' && employee.placements?.some((placement) => placement.status === 'ACTIVE');
  const showsAttendance = !!role && OPERATIONAL_ROLES.includes(role) && !!summary?.attendance;
  const showsLeaveSummary = !!role && LEAVE_SUMMARY_ROLES.includes(role) && summary?.pendingLeaveRequests !== undefined;
  const showsPlacementSummary = !!role && PLACEMENT_SUMMARY_ROLES.includes(role) && summary?.pendingPlacementRequests !== undefined;
  const showsActivePlacements = !!role && OPERATIONAL_ROLES.includes(role) && summary?.activePlacements !== undefined;

  async function load() {
    try {
      const [summaryData, attentionData, employeeData] = await Promise.all([
        apiFetch<DashboardSummary>('/dashboard/summary', { token: getToken() }),
        apiFetch<AttentionCard[]>('/dashboard/attention', { token: getToken() }),
        apiFetch<{ attendanceRequired: boolean; status: string; placements?: { status: string }[] }>('/employees/me', { token: getToken() }).catch((err) => {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        }),
      ]);
      setSummary(summaryData);
      setAttention(attentionData);
      setEmployee(employeeData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat ringkasan dashboard');
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">
         {!authResolved ? 'Memuat dashboard...' : hasSelfAttendance ? `Selamat datang${user ? `, ${user.email}` : ''}` : `Dashboard ${isKoordinator ? 'Tim Anda' : 'Operasional'}`}
      </h1>
      {hasSelfAttendance && (
        <p className="mb-4 text-sm text-slate-500">
          Gunakan menu <strong>Absensi</strong> untuk check-in/check-out, atau <strong>Cuti, Izin & Resign</strong> untuk mengajukan cuti/izin.
        </p>
      )}
      <p className="mb-4 text-sm text-slate-500">
        {summary?.date ? new Date(summary.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}
      </p>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {showsAttendance && summary?.attendance && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">HARI INI</h2>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Hadir" value={summary.attendance.hadir} style="text-green-600" href="/attendance" />
            <StatCard label="Terlambat" value={summary.attendance.terlambat} style="text-yellow-600" href="/attendance" />
            <StatCard label="Tidak Hadir" value={summary.attendance.tidakHadir} style="text-red-600" href="/attendance" />
            <StatCard label="Perlu Ditinjau" value={summary.attendance.perluDitinjau} style="text-blue-600" href="/attendance?validationStatus=NEEDS_REVIEW" />
          </div>
        </>
      )}

      {(showsLeaveSummary || showsPlacementSummary || showsActivePlacements) && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">MENUNGGU TINDAKAN</h2>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {showsLeaveSummary && <StatCard label="Pengajuan Cuti/Izin Pending" value={summary?.pendingLeaveRequests ?? 0} style="text-slate-900" href="/leave-requests" />}
            {showsPlacementSummary && <StatCard label="Pengajuan Penempatan Pending" value={summary?.pendingPlacementRequests ?? 0} style="text-slate-900" href="/placement-requests" />}
            {showsActivePlacements && <StatCard label="Penempatan Aktif" value={summary?.activePlacements ?? 0} style="text-slate-900" href="/employees" />}
          </div>
        </>
      )}

      {attention.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">PERLU PERHATIAN</h2>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {attention.map((card) => <StatCard key={card.key} label={card.label} value={card.count} style="text-slate-900" href={card.href} />)}
          </div>
        </>
      )}

      {hasSelfAttendance && (
        <div className="mb-6 flex gap-3">
          <Link href="/attendance" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">Absensi Hari Ini</Link>
          <Link href="/leave-requests" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">Ajukan Cuti/Izin</Link>
        </div>
      )}

      {!!role && REPORT_ROLES.includes(role) && (
          <Link href="/reports" className="text-sm font-medium text-slate-700 underline">
            Lihat & unduh laporan lengkap →
          </Link>
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
