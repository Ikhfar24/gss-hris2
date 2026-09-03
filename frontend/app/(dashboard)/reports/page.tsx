'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

interface EmployeeOption {
  id: string;
  name: string;
}
interface LocationOption {
  id: string;
  name: string;
}

const REPORTS = [
  { key: 'attendance', label: 'Rekap Absensi & Keterlambatan', hasDateRange: true, hasStatus: false },
  { key: 'placements', label: 'Riwayat Penempatan', hasDateRange: false, hasStatus: false },
  { key: 'leave-requests', label: 'Rekap Cuti & Izin', hasDateRange: true, hasStatus: true },
] as const;

export default function ReportsPage() {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [filters, setFilters] = useState({ from: '', to: '', employeeId: '', locationId: '', status: '' });

  useEffect(() => {
    Promise.all([
      apiFetch<EmployeeOption[]>('/employees').catch(() => []),
      apiFetch<LocationOption[]>('/locations').catch(() => []),
    ]).then(([emps, locs]) => {
      setEmployees(emps);
      setLocations(locs);
    });
  }, []);

  async function download(reportKey: string, format: 'xlsx' | 'pdf') {
    setError(null);
    setDownloading(`${reportKey}-${format}`);
    try {
      const params = new URLSearchParams({ format });
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.employeeId) params.set('employeeId', filters.employeeId);
      if (filters.locationId) params.set('locationId', filters.locationId);
      if (filters.status) params.set('status', filters.status);

      const res = await fetch(`${API_URL}/reports/${reportKey}?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new ApiError(res.status, 'Gagal membuat laporan');

      const disposition = res.headers.get('content-disposition') ?? '';
      const match = /filename="(.+)"/.exec(disposition);
      const filename = match?.[1] ?? `${reportKey}.${format}`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengunduh laporan');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Laporan & Export</h1>
      <p className="mb-4 text-sm text-slate-500">Export ke Excel atau PDF sesuai §16 PRD.</p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-6 grid max-w-2xl gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <label className="text-sm">
          Dari tanggal
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          Sampai tanggal
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          Karyawan (opsional)
          <select value={filters.employeeId} onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Semua karyawan</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Lokasi (opsional)
          <select value={filters.locationId} onChange={(e) => setFilters({ ...filters, locationId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Semua lokasi</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          Status pengajuan (khusus Rekap Cuti & Izin)
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Semua status</option>
            <option value="PENDING">Menunggu Review</option>
            <option value="APPROVED">Disetujui</option>
            <option value="REJECTED">Ditolak</option>
            <option value="CANCELLED">Dibatalkan</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {REPORTS.map((r) => (
          <div key={r.key} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold">{r.label}</h3>
            <div className="flex gap-2">
              <button
                onClick={() => download(r.key, 'xlsx')}
                disabled={downloading === `${r.key}-xlsx`}
                className="flex-1 rounded-lg bg-slate-900 py-2 text-xs text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {downloading === `${r.key}-xlsx` ? '...' : 'Excel (.xlsx)'}
              </button>
              <button
                onClick={() => download(r.key, 'pdf')}
                disabled={downloading === `${r.key}-pdf`}
                className="flex-1 rounded-lg border border-slate-300 py-2 text-xs hover:bg-slate-50 disabled:opacity-60"
              >
                {downloading === `${r.key}-pdf` ? '...' : 'PDF'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
