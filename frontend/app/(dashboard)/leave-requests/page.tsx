'use client';

import { useEffect, useState, FormEvent } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

interface EmployeeOption {
  id: string;
  name: string;
}

interface LeaveRequestRow {
  id: string;
  type: string;
  startDate: string;
  endDate: string | null;
  reason: string;
  documentUrl: string | null;
  status: string;
  requestedAt: string;
  reviewNote: string | null;
  employee: { id: string; name: string };
  approvals: { id: string; stage: string; decision: string; note: string | null; decidedAt: string }[];
}

const TYPE_LABEL: Record<string, string> = {
  CUTI: 'Cuti',
  SAKIT: 'Sakit',
  IZIN_PULANG_AWAL: 'Izin Pulang Awal',
  IZIN_MENDADAK: 'Izin Mendadak',
  IZIN_LAIN: 'Izin Lain',
  RESIGN: 'Resign',
};

const STATUS_LABEL: Record<string, { label: string; style: string }> = {
  PENDING: { label: 'Menunggu HR', style: 'bg-yellow-100 text-yellow-700' },
  PENDING_COORDINATOR: { label: 'Menunggu Koordinator', style: 'bg-yellow-100 text-yellow-700' },
  PENDING_HR: { label: 'Menunggu HR', style: 'bg-yellow-100 text-yellow-700' },
  PENDING_DIRECTOR: { label: 'Menunggu Direktur', style: 'bg-yellow-100 text-yellow-700' },
  APPROVED: { label: 'Disetujui', style: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Ditolak', style: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Dibatalkan', style: 'bg-slate-200 text-slate-600' },
};

const STAGE_LABEL: Record<string, string> = { COORDINATOR: 'Koordinator', HR: 'HR', DIRECTOR: 'Direktur' };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function LeaveRequestsPage() {
  const role = getUser()?.role;
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ type: 'CUTI', startDate: '', endDate: '', reason: '', employeeId: '' });

  const isHr = role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const isKaryawan = role === 'KARYAWAN';
  const canCreate = Boolean(role);

  async function load() {
    try {
      const token = getToken();
      const calls: Promise<any>[] = [apiFetch<LeaveRequestRow[]>('/leave-requests', { token })];
      if (isHr) calls.push(apiFetch<EmployeeOption[]>('/employees', { token }));
      const [reqs, emps] = await Promise.all(calls);
      setRequests(reqs);
      if (emps) setEmployees(emps);
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
      const documentBase64 = file ? await fileToBase64(file) : undefined;
      await apiFetch('/leave-requests', {
        method: 'POST',
        token: getToken(),
        body: {
          type: form.type,
          startDate: form.startDate,
          endDate: form.endDate || undefined,
          reason: form.reason,
          employeeId: isHr ? form.employeeId || undefined : undefined,
          documentBase64,
        },
      });
      setForm({ type: 'CUTI', startDate: '', endDate: '', reason: '', employeeId: '' });
      setFile(null);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengirim pengajuan');
    } finally {
      setSubmitting(false);
    }
  }

  async function review(id: string, approve: boolean) {
    setError(null);
    try {
      await apiFetch(`/leave-requests/${id}/review`, { method: 'PATCH', token: getToken(), body: { approve } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memproses pengajuan');
    }
  }

  async function intervene(id: string, approve: boolean) {
    const note = window.prompt('Alasan intervensi (wajib):');
    if (!note?.trim()) return;
    try {
      await apiFetch(`/leave-requests/${id}/intervene`, { method: 'PATCH', token: getToken(), body: { approve, note } });
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Gagal melakukan intervensi'); }
  }

  async function finalizeResignation(id: string) {
    try {
      await apiFetch(`/leave-requests/${id}/finalize-resignation`, { method: 'PATCH', token: getToken() });
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Gagal memfinalisasi resign'); }
  }

  function canReview(request: LeaveRequestRow) {
    return (request.status === 'PENDING_COORDINATOR' && role === 'KOORDINATOR')
      || (request.status === 'PENDING_HR' && isHr)
      || (request.status === 'PENDING_DIRECTOR' && (role === 'DIREKTUR' || role === 'SYSTEM_ADMIN'))
      || (request.status === 'PENDING' && isHr);
  }

  async function cancel(id: string) {
    setError(null);
    try {
      await apiFetch(`/leave-requests/${id}/cancel`, { method: 'PATCH', token: getToken() });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membatalkan pengajuan');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cuti, Izin & Resign</h1>
        {canCreate && (
          <button onClick={() => setShowForm((s) => !s)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
            {showForm ? 'Batal' : '+ Ajukan'}
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={onCreate} className="mb-6 grid max-w-xl gap-3 rounded-xl border border-slate-200 bg-white p-4">
          {isHr && (
            <select required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">-- Ajukan atas nama karyawan --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          )}
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Tanggal mulai
              <input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              Tanggal selesai (opsional)
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
          </div>
          <textarea required placeholder="Alasan" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} />
          <label className="text-sm">
            {form.type === 'SAKIT' ? 'Bukti medis (wajib, JPEG/PNG/PDF)' : 'Dokumen pendukung (opsional, JPEG/PNG/PDF)'}
            <input required={form.type === 'SAKIT'} type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 w-full text-sm" />
          </label>
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
              <th className="px-4 py-2">Jenis</th>
              <th className="px-4 py-2">Tanggal</th>
              <th className="px-4 py-2">Alasan</th>
               <th className="px-4 py-2">Status & Riwayat</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const st = STATUS_LABEL[r.status] ?? { label: r.status, style: 'bg-slate-100' };
              return (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2">{r.employee.name}</td>
                  <td className="px-4 py-2">{TYPE_LABEL[r.type] ?? r.type}</td>
                  <td className="px-4 py-2">
                    {new Date(r.startDate).toLocaleDateString('id-ID')}
                    {r.endDate ? ` – ${new Date(r.endDate).toLocaleDateString('id-ID')}` : ''}
                  </td>
                  <td className="px-4 py-2 max-w-xs">
                    <div>{r.reason}</div>
                    {r.documentUrl && (
                      <a href={`http://localhost:4000${r.documentUrl}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                        Lihat dokumen
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-2">
                     <span className={`rounded-full px-2 py-0.5 text-xs ${st.style}`}>{st.label}</span>
                     {r.reviewNote && <div className="mt-1 text-xs text-slate-400">{r.reviewNote}</div>}
                     {r.approvals.length > 0 && <div className="mt-2 space-y-1 text-xs text-slate-500">{r.approvals.map((approval) => <div key={approval.id}>{STAGE_LABEL[approval.stage] ?? approval.stage}: {approval.decision === 'APPROVED' ? 'disetujui' : 'ditolak'}{approval.note ? ` (${approval.note})` : ''} · {new Date(approval.decidedAt).toLocaleDateString('id-ID')}</div>)}</div>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                       {canReview(r) && (
                        <>
                          <button onClick={() => review(r.id, true)} className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700">Setujui</button>
                          <button onClick={() => review(r.id, false)} className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700">Tolak</button>
                        </>
                       )}
                       {isHr && ['PENDING', 'PENDING_COORDINATOR', 'PENDING_HR', 'PENDING_DIRECTOR'].includes(r.status) && !canReview(r) && <><button onClick={() => intervene(r.id, true)} className="rounded-lg border border-green-600 px-2 py-1 text-xs text-green-700">Intervensi setujui</button><button onClick={() => intervene(r.id, false)} className="rounded-lg border border-red-600 px-2 py-1 text-xs text-red-700">Intervensi tolak</button></>}
                       {['PENDING', 'PENDING_COORDINATOR', 'PENDING_HR', 'PENDING_DIRECTOR'].includes(r.status) && (isHr || isKaryawan) && (
                        <button onClick={() => cancel(r.id)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">Batalkan</button>
                       )}
                       {isHr && r.type === 'RESIGN' && r.status === 'APPROVED' && <button onClick={() => finalizeResignation(r.id)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">Finalisasi resign</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">Belum ada pengajuan.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
