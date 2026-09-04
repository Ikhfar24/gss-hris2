'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

interface OvertimeRequest {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  status: string;
  reviewNote: string | null;
  employee: { name: string };
}

const STATUS: Record<string, { label: string; style: string }> = {
  PENDING: { label: 'Menunggu review', style: 'bg-yellow-100 text-yellow-700' },
  APPROVED: { label: 'Disetujui', style: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Ditolak', style: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Dibatalkan', style: 'bg-slate-200 text-slate-600' },
};

function toDateTime(date: string, time: string) {
  return date && time ? new Date(`${date}T${time}`).toISOString() : '';
}

export default function OvertimeRequestsPage() {
  const role = getUser()?.role;
  const isEmployee = role === 'KARYAWAN';
  const canReview = role === 'KOORDINATOR' || role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const isHr = role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const [rows, setRows] = useState<OvertimeRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ date: '', startTime: '', endTime: '', reason: '' });

  async function load() {
    try {
      setRows(await apiFetch<OvertimeRequest[]>('/overtime-requests', { token: getToken() }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat pengajuan lembur');
    }
  }
  useEffect(() => { load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/overtime-requests', { method: 'POST', token: getToken(), body: { date: form.date, startTime: toDateTime(form.date, form.startTime), endTime: toDateTime(form.date, form.endTime), reason: form.reason } });
      setForm({ date: '', startTime: '', endTime: '', reason: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengirim pengajuan lembur');
    } finally {
      setSubmitting(false);
    }
  }

  async function review(id: string, approve: boolean) {
    const note = window.prompt(approve ? 'Catatan persetujuan (opsional):' : 'Alasan penolakan (opsional):');
    if (note === null) return;
    try {
      await apiFetch(`/overtime-requests/${id}/review`, { method: 'PATCH', token: getToken(), body: { approve, note: note || undefined } });
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Gagal mereview pengajuan lembur'); }
  }

  async function cancel(id: string) {
    try {
      await apiFetch(`/overtime-requests/${id}/cancel`, { method: 'PATCH', token: getToken() });
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Gagal membatalkan pengajuan lembur'); }
  }

  return <div><h1 className="mb-4 text-2xl font-semibold">Pengajuan Lembur</h1>{error && <p className="mb-4 text-sm text-red-600">{error}</p>}
    {isEmployee && <form onSubmit={submit} className="mb-6 grid max-w-xl gap-3 rounded-xl border border-slate-200 bg-white p-4"><label className="text-sm">Tanggal<input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm">Mulai<input required type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm">Selesai<input required type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label></div><textarea required minLength={3} rows={3} placeholder="Alasan lembur" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button disabled={submitting} className="rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60">{submitting ? 'Mengirim...' : 'Ajukan Lembur'}</button></form>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Karyawan</th><th className="px-4 py-2">Waktu</th><th className="px-4 py-2">Alasan</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th></tr></thead><tbody>{rows.map((row) => { const status = STATUS[row.status] ?? { label: row.status, style: 'bg-slate-100 text-slate-600' }; return <tr key={row.id} className="border-t border-slate-100 align-top"><td className="px-4 py-2">{row.employee.name}</td><td className="px-4 py-2">{new Date(row.date).toLocaleDateString('id-ID')}<div className="text-xs text-slate-500">{new Date(row.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} - {new Date(row.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div></td><td className="px-4 py-2">{row.reason}</td><td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${status.style}`}>{status.label}</span>{row.reviewNote && <div className="mt-1 text-xs text-slate-500">{row.reviewNote}</div>}</td><td className="px-4 py-2"><div className="flex gap-2">{canReview && row.status === 'PENDING' && <><button onClick={() => review(row.id, true)} className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white">Setujui</button><button onClick={() => review(row.id, false)} className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white">Tolak</button></>}{row.status === 'PENDING' && (isEmployee || isHr) && <button onClick={() => cancel(row.id)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">Batalkan</button>}</div></td></tr>; })}{rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Belum ada pengajuan lembur.</td></tr>}</tbody></table></div>
  </div>;
}
