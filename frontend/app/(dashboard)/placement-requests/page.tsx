'use client';

import { useEffect, useState, FormEvent } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

interface EmployeeOption {
  id: string;
  name: string;
}
interface LocationOption {
  id: string;
  name: string;
}

interface PlacementRequestRow {
  id: string;
  type: 'REASSIGNMENT' | 'MUTATION';
  status: string;
  reason: string;
  startDate: string;
  requestedAt: string;
  employee: { id: string; name: string };
  originLocation: { name: string } | null;
  destinationLocation: { name: string };
}

const STATUS_LABEL: Record<string, { label: string; style: string }> = {
  PENDING_HR: { label: 'Menunggu HR', style: 'bg-yellow-100 text-yellow-700' },
  PENDING_DIRECTOR: { label: 'Menunggu Direktur', style: 'bg-blue-100 text-blue-700' },
  APPROVED: { label: 'Disetujui', style: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Ditolak', style: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Dibatalkan', style: 'bg-slate-200 text-slate-600' },
};

export default function PlacementRequestsPage() {
  const [requests, setRequests] = useState<PlacementRequestRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ employeeId: '', destinationLocationId: '', startDate: '', reason: '' });
  const role = getUser()?.role;

  const canCreate = role === 'KOORDINATOR' || role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const canHrReview = role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const canDirectorApprove = role === 'DIREKTUR' || role === 'SYSTEM_ADMIN';

  async function load() {
    try {
      const token = getToken();
      const calls: Promise<any>[] = [apiFetch<PlacementRequestRow[]>('/placement-requests', { token })];
      if (canCreate) {
        calls.push(apiFetch<EmployeeOption[]>('/employees', { token }));
        calls.push(apiFetch<LocationOption[]>('/locations', { token }));
      }
      const [reqs, emps, locs] = await Promise.all(calls);
      setRequests(reqs);
      if (emps) setEmployees(emps);
      if (locs) setLocations(locs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat data pengajuan');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/placement-requests', { method: 'POST', token: getToken(), body: form });
      setForm({ employeeId: '', destinationLocationId: '', startDate: '', reason: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuat pengajuan');
    } finally {
      setSubmitting(false);
    }
  }

  async function act(path: string, body?: unknown) {
    setError(null);
    try {
      await apiFetch(path, { method: 'PATCH', token: getToken(), body });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memproses pengajuan');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pengajuan Penempatan / Mutasi</h1>
        {canCreate && (
          <button onClick={() => setShowForm((s) => !s)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
            {showForm ? 'Batal' : '+ Ajukan Perubahan'}
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={onCreate} className="mb-6 grid max-w-xl gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <select required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">-- Pilih karyawan --</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select required value={form.destinationLocationId} onChange={(e) => setForm({ ...form, destinationLocationId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">-- Lokasi tujuan --</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <label className="text-sm">
            Tanggal mulai
            <input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <textarea required placeholder="Alasan perpindahan" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} />
          <p className="text-xs text-slate-500">
            Tipe pengajuan (Reassignment / Mutasi) ditentukan otomatis dari jenis tenaga kerja karyawan.
          </p>
          <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
            {submitting ? 'Mengirim...' : 'Kirim Pengajuan'}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Karyawan</th>
              <th className="px-4 py-2">Dari → Ke</th>
              <th className="px-4 py-2">Mulai</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const st = STATUS_LABEL[r.status] ?? { label: r.status, style: 'bg-slate-100' };
              return (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2">
                    {r.employee.name}
                    <div className="text-xs text-slate-400">{r.type === 'MUTATION' ? 'Mutasi (Arsiparis)' : 'Reassignment (Borongan)'}</div>
                  </td>
                  <td className="px-4 py-2">{r.originLocation?.name ?? '-'} → {r.destinationLocation.name}</td>
                  <td className="px-4 py-2">{new Date(r.startDate).toLocaleDateString('id-ID')}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${st.style}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      {canHrReview && r.status === 'PENDING_HR' && (
                        <>
                          <button onClick={() => act(`/placement-requests/${r.id}/hr-review`, { approve: true })} className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700">Setujui (HR)</button>
                          <button onClick={() => act(`/placement-requests/${r.id}/hr-review`, { approve: false })} className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700">Tolak</button>
                        </>
                      )}
                      {canDirectorApprove && r.status === 'PENDING_DIRECTOR' && (
                        <>
                          <button onClick={() => act(`/placement-requests/${r.id}/director-approve`, { approve: true })} className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700">Setujui (Direktur)</button>
                          <button onClick={() => act(`/placement-requests/${r.id}/director-approve`, { approve: false })} className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700">Tolak</button>
                        </>
                      )}
                      {['PENDING_HR', 'PENDING_DIRECTOR'].includes(r.status) && (
                        <button onClick={() => act(`/placement-requests/${r.id}/cancel`)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">Batalkan</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
