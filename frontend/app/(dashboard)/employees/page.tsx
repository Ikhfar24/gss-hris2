'use client';

import { Fragment, useEffect, useState, FormEvent } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';

interface LocationOption {
  id: string;
  name: string;
}

interface ContractRow {
  id: string;
  type: string;
  startDate: string;
  endDate: string | null;
  status: string;
  baseSalary: number | null;
}

interface EmployeeRow {
  id: string;
  name: string;
  employmentType: 'TENAGA_BORONGAN' | 'TENAGA_ARSIPARIS';
  status: string;
  joinDate: string;
  dailyRate: number | null;
  placements: { location: { name: string } }[];
  contracts?: ContractRow[];
}

const TYPE_LABEL: Record<string, string> = {
  TENAGA_BORONGAN: 'Tenaga Borongan',
  TENAGA_ARSIPARIS: 'Tenaga Arsiparis',
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  TRAINING: 'bg-yellow-100 text-yellow-700',
  ON_LEAVE: 'bg-blue-100 text-blue-700',
  RESIGNED: 'bg-slate-200 text-slate-600',
  TERMINATED: 'bg-red-100 text-red-700',
};

function formatRupiah(n: number | null) {
  if (n === null || n === undefined) return '-';
  return `Rp ${n.toLocaleString('id-ID')}`;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contracts, setContracts] = useState<Record<string, ContractRow[]>>({});
  const [contractForm, setContractForm] = useState({ type: 'PKWT', startDate: '', endDate: '', baseSalary: '' });
  const [form, setForm] = useState({
    name: '',
    employmentType: 'TENAGA_BORONGAN',
    joinDate: '',
    initialLocationId: '',
    dailyRate: '',
  });

  async function load() {
    try {
      const token = getToken();
      const [emps, locs] = await Promise.all([
        apiFetch<EmployeeRow[]>('/employees', { token }),
        apiFetch<LocationOption[]>('/locations', { token }),
      ]);
      setEmployees(emps);
      setLocations(locs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat data karyawan');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/employees', {
        method: 'POST',
        token: getToken(),
        body: {
          ...form,
          initialLocationId: form.initialLocationId || undefined,
          dailyRate: form.dailyRate ? Number(form.dailyRate) : undefined,
        },
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuat data karyawan');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleContracts(employeeId: string) {
    if (expandedId === employeeId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(employeeId);
    if (!contracts[employeeId]) {
      try {
        const data = await apiFetch<ContractRow[]>(`/contracts/employee/${employeeId}`, { token: getToken() });
        setContracts((c) => ({ ...c, [employeeId]: data }));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Gagal memuat kontrak');
      }
    }
  }

  async function onAddContract(employeeId: string, e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/contracts', {
        method: 'POST',
        token: getToken(),
        body: {
          employeeId,
          type: contractForm.type,
          startDate: contractForm.startDate,
          endDate: contractForm.endDate || undefined,
          baseSalary: contractForm.baseSalary ? Number(contractForm.baseSalary) : undefined,
        },
      });
      setContractForm({ type: 'PKWT', startDate: '', endDate: '', baseSalary: '' });
      const data = await apiFetch<ContractRow[]>(`/contracts/employee/${employeeId}`, { token: getToken() });
      setContracts((c) => ({ ...c, [employeeId]: data }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menambah kontrak');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Data Karyawan</h1>
        <button onClick={() => setShowForm((s) => !s)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
          {showForm ? 'Batal' : '+ Tambah Karyawan'}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={onCreate} className="mb-6 grid max-w-xl gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <input required placeholder="Nama lengkap" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="TENAGA_BORONGAN">Tenaga Borongan</option>
            <option value="TENAGA_ARSIPARIS">Tenaga Arsiparis</option>
          </select>
          <label className="text-sm">
            Tanggal bergabung
            <input required type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <select value={form.initialLocationId} onChange={(e) => setForm({ ...form, initialLocationId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">-- Penempatan awal (opsional) --</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <label className="text-sm">
            Tarif Harian Lepas (opsional — isi kalau belum ada kontrak/masih training)
            <input type="number" min={0} placeholder="cth. 95000" value={form.dailyRate} onChange={(e) => setForm({ ...form, dailyRate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
            {submitting ? 'Menyimpan...' : 'Simpan Karyawan'}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Nama</th>
              <th className="px-4 py-2">Jenis</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Penempatan Aktif</th>
              <th className="px-4 py-2">Tarif Harian</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <Fragment key={emp.id}>
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-2">{emp.name}</td>
                  <td className="px-4 py-2">{TYPE_LABEL[emp.employmentType]}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[emp.status] ?? 'bg-slate-100'}`}>
                      {emp.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">{emp.placements[0]?.location?.name ?? '-'}</td>
                  <td className="px-4 py-2">{formatRupiah(emp.dailyRate)}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => toggleContracts(emp.id)} className="text-xs text-slate-500 underline hover:text-slate-900">
                      {expandedId === emp.id ? 'Tutup' : 'Kelola Kontrak'}
                    </button>
                  </td>
                </tr>
                {expandedId === emp.id && (
                  <tr className="border-t border-slate-100 bg-slate-50">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="mb-3">
                        <h4 className="mb-2 text-xs font-semibold text-slate-500">RIWAYAT KONTRAK</h4>
                        {(contracts[emp.id] ?? []).length === 0 && <p className="text-xs text-slate-400">Belum ada kontrak.</p>}
                        <ul className="space-y-1">
                          {(contracts[emp.id] ?? []).map((c) => (
                            <li key={c.id} className="text-xs text-slate-700">
                              {c.type} · {new Date(c.startDate).toLocaleDateString('id-ID')}
                              {c.endDate ? ` – ${new Date(c.endDate).toLocaleDateString('id-ID')}` : ' (tanpa batas)'} ·{' '}
                              <span className={c.status === 'ACTIVE' ? 'text-green-600' : 'text-slate-400'}>{c.status}</span> ·{' '}
                              {formatRupiah(c.baseSalary)}/bulan
                            </li>
                          ))}
                        </ul>
                      </div>
                      <form onSubmit={(e) => onAddContract(emp.id, e)} className="grid max-w-md gap-2 sm:grid-cols-2">
                        <select value={contractForm.type} onChange={(e) => setContractForm({ ...contractForm, type: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                          <option value="PKWT">PKWT</option>
                          <option value="PKWTT">PKWTT</option>
                          <option value="OTHER">Lainnya</option>
                        </select>
                        <input type="number" min={0} required placeholder="Gaji pokok/bulan" value={contractForm.baseSalary} onChange={(e) => setContractForm({ ...contractForm, baseSalary: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                        <input type="date" required value={contractForm.startDate} onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                        <input type="date" placeholder="Selesai (opsional)" value={contractForm.endDate} onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                        <button type="submit" className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-800 sm:col-span-2">
                          + Tambah Kontrak
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
