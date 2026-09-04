'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

interface Assignment {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  coordinationNote: string | null;
  status: string;
  approvalNote: string | null;
  employee: { id: string; name: string };
  originPlacement: { id: string; location: { name: string } };
  location: { id: string; name: string };
}
interface Option { id: string; name: string }
interface EmployeeResponse { data: Option[] }
interface Placement { id: string; employeeId: string; location: { name: string } }

const STATUS: Record<string, { label: string; style: string }> = {
  PENDING: { label: 'Menunggu persetujuan HR', style: 'bg-yellow-100 text-yellow-700' },
  APPROVED: { label: 'Disetujui', style: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Ditolak', style: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Dibatalkan', style: 'bg-slate-100 text-slate-600' },
  COMPLETED: { label: 'Selesai', style: 'bg-blue-100 text-blue-700' },
};

export default function TemporaryAssignmentsPage() {
  const role = getUser()?.role;
  const isHr = role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const [rows, setRows] = useState<Assignment[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employeeId: '', originPlacementId: '', locationId: '', startDate: '', endDate: '', reason: '', coordinationNote: '' });

  async function load() {
    try {
      const token = getToken();
      const [assignments, employeeResult, locationResult, placementResult] = await Promise.all([
        apiFetch<Assignment[]>('/temporary-assignments', { token }),
        apiFetch<EmployeeResponse>('/employees', { token }),
        apiFetch<Option[]>('/locations', { token }),
        apiFetch<Placement[]>('/placements/active', { token }),
      ]);
      setRows(assignments);
      setEmployees(employeeResult.data);
      setLocations(locationResult);
      setPlacements(placementResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat penugasan sementara');
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await apiFetch('/temporary-assignments', { method: 'POST', token: getToken(), body: { ...form, coordinationNote: form.coordinationNote || undefined } });
      setForm({ employeeId: '', originPlacementId: '', locationId: '', startDate: '', endDate: '', reason: '', coordinationNote: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengajukan penugasan');
    }
  }

  async function action(id: string, path: string, body?: object) {
    try {
      await apiFetch(`/temporary-assignments/${id}/${path}`, { method: 'PATCH', token: getToken(), body });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memproses penugasan');
    }
  }

  async function review(id: string, approve: boolean) {
    const note = window.prompt(approve ? 'Catatan persetujuan (opsional):' : 'Alasan penolakan:');
    if (!approve && !note) return;
    await action(id, 'review', { approve, note: note || undefined });
  }

  const originPlacements = placements.filter((item) => item.employeeId === form.employeeId);
  return <div>
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-2xl font-semibold">Penugasan Sementara</h1>
      <button onClick={() => setShowForm((value) => !value)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">{showForm ? 'Batal' : '+ Ajukan Penugasan'}</button>
    </div>
    {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
    {showForm && <form onSubmit={submit} className="mb-6 grid max-w-xl gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <select required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value, originPlacementId: '' })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">-- Pilih karyawan --</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select required value={form.originPlacementId} onChange={(e) => setForm({ ...form, originPlacementId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">-- Penempatan asal --</option>{originPlacements.map((item) => <option key={item.id} value={item.id}>{item.location.name}</option>)}</select>
      <select required value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">-- Lokasi tujuan --</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <div className="grid grid-cols-2 gap-3"><input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /><input required type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
      <textarea required placeholder="Alasan penugasan" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} />
      <textarea placeholder="Catatan koordinasi (opsional)" value={form.coordinationNote} onChange={(e) => setForm({ ...form, coordinationNote: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} />
      <button className="rounded-lg bg-slate-900 py-2 text-sm text-white hover:bg-slate-800">Kirim Pengajuan</button>
    </form>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Karyawan</th><th className="px-4 py-2">Lokasi</th><th className="px-4 py-2">Periode</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th></tr></thead><tbody>
      {rows.map((row) => { const status = STATUS[row.status] ?? { label: row.status, style: 'bg-slate-100 text-slate-600' }; return <tr key={row.id} className="border-t border-slate-100 align-top"><td className="px-4 py-2">{row.employee.name}<div className="text-xs text-slate-400">{row.reason}</div></td><td className="px-4 py-2">{row.originPlacement.location.name} ke {row.location.name}</td><td className="px-4 py-2">{new Date(row.startDate).toLocaleDateString('id-ID')} - {new Date(row.endDate).toLocaleDateString('id-ID')}</td><td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${status.style}`}>{status.label}</span>{row.approvalNote && <div className="mt-1 text-xs text-slate-400">{row.approvalNote}</div>}</td><td className="px-4 py-2"><div className="flex flex-wrap gap-2">{isHr && row.status === 'PENDING' && <><button onClick={() => review(row.id, true)} className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white">Setujui</button><button onClick={() => review(row.id, false)} className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white">Tolak</button></>}{row.status === 'PENDING' && <button onClick={() => action(row.id, 'cancel')} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">Batalkan</button>}{isHr && row.status === 'APPROVED' && <button onClick={() => action(row.id, 'complete')} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">Selesaikan</button>}</div></td></tr>; })}
      {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Belum ada penugasan sementara.</td></tr>}
    </tbody></table></div>
  </div>;
}
