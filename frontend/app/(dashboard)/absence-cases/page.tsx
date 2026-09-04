'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

interface AbsenceCase {
  id: string;
  date: string;
  status: string;
  explanation: string | null;
  note: string | null;
  employee?: { name: string; employeeNumber: string | null };
}
interface EmployeeResponse { data: { id: string; name: string }[] }

const STATUS: Record<string, { label: string; style: string }> = {
  PENDING_EXPLANATION: { label: 'Menunggu penjelasan', style: 'bg-yellow-100 text-yellow-700' },
  CONFIRMED_ALPHA: { label: 'Dikonfirmasi alpa', style: 'bg-red-100 text-red-700' },
  EXCUSED: { label: 'Dimaafkan', style: 'bg-green-100 text-green-700' },
};

export default function AbsenceCasesPage() {
  const role = getUser()?.role;
  const canManage = role === 'KOORDINATOR' || role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const isHr = role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const [rows, setRows] = useState<AbsenceCase[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ employeeId: '', date: '' });
  const [explanation, setExplanation] = useState({ caseId: '', text: '' });

  async function load() {
    try {
      if (!canManage) {
        setRows(await apiFetch<AbsenceCase[]>('/absence-cases/my'));
        return;
      }
      const token = getToken();
      const calls: Promise<AbsenceCase[] | EmployeeResponse>[] = [apiFetch<AbsenceCase[]>('/absence-cases/attention', { token })];
      if (isHr) calls.push(apiFetch<EmployeeResponse>('/employees', { token }));
      const [cases, employeeResult] = await Promise.all(calls);
      setRows(cases as AbsenceCase[]);
      if (employeeResult) setEmployees((employeeResult as EmployeeResponse).data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat kasus ketidakhadiran');
    }
  }

  useEffect(() => { load(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await apiFetch('/absence-cases', { method: 'POST', token: getToken(), body: form });
      setForm({ employeeId: '', date: '' });
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Gagal membuat kasus ketidakhadiran'); }
  }

  async function followUp(id: string) {
    const note = window.prompt('Catatan tindak lanjut:');
    if (!note) return;
    try { await apiFetch(`/absence-cases/${id}/follow-up`, { method: 'PATCH', token: getToken(), body: { note } }); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : 'Gagal menyimpan tindak lanjut'); }
  }

  async function resolve(id: string, decision: 'EXCUSE' | 'CONFIRM_ALPHA') {
    const reason = window.prompt(decision === 'EXCUSE' ? 'Alasan memaafkan ketidakhadiran:' : 'Alasan konfirmasi alpa:');
    if (!reason) return;
    try { await apiFetch(`/absence-cases/${id}/resolve`, { method: 'PATCH', token: getToken(), body: { decision, reason } }); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : 'Gagal menyelesaikan kasus'); }
  }

  async function submitExplanation(event: FormEvent) {
    event.preventDefault();
    try {
      await apiFetch(`/absence-cases/${explanation.caseId}/explanation`, { method: 'PATCH', token: getToken(), body: { explanation: explanation.text } });
      setExplanation({ caseId: '', text: '' });
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Gagal mengirim penjelasan'); }
  }

  if (!canManage) return <div className="max-w-xl"><h1 className="mb-2 text-2xl font-semibold">Penjelasan Ketidakhadiran</h1><p className="mb-4 text-sm text-slate-500">Berikan penjelasan untuk kasus ketidakhadiran yang masih menunggu.</p>{error && <p className="mb-4 text-sm text-red-600">{error}</p>}<div className="mb-4 space-y-2">{rows.map((row) => <button key={row.id} onClick={() => setExplanation({ caseId: row.id, text: row.explanation ?? '' })} className="block w-full rounded border p-3 text-left text-sm">{new Date(row.date).toLocaleDateString('id-ID')} - {STATUS[row.status]?.label ?? row.status}</button>)}{rows.length === 0 && <p className="text-sm text-slate-400">Tidak ada kasus ketidakhadiran.</p>}</div>{explanation.caseId && <form onSubmit={submitExplanation} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4"><textarea required placeholder="Penjelasan ketidakhadiran" value={explanation.text} onChange={(e) => setExplanation({ ...explanation, text: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={4} /><button className="rounded-lg bg-slate-900 py-2 text-sm text-white">Kirim Penjelasan</button></form>}</div>;

  return <div><h1 className="mb-4 text-2xl font-semibold">Kasus Ketidakhadiran</h1>{error && <p className="mb-4 text-sm text-red-600">{error}</p>}
    {isHr && <form onSubmit={create} className="mb-6 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4"><select required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">-- Pilih karyawan --</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select><input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Buat Kasus</button></form>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Karyawan</th><th className="px-4 py-2">Tanggal</th><th className="px-4 py-2">Penjelasan / Catatan</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th></tr></thead><tbody>{rows.map((row) => { const status = STATUS[row.status] ?? { label: row.status, style: 'bg-slate-100 text-slate-600' }; return <tr key={row.id} className="border-t border-slate-100 align-top"><td className="px-4 py-2">{row.employee?.name ?? '-'}</td><td className="px-4 py-2">{new Date(row.date).toLocaleDateString('id-ID')}</td><td className="px-4 py-2">{row.explanation || '-'}{row.note && <div className="mt-1 text-xs text-slate-400">{row.note}</div>}</td><td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${status.style}`}>{status.label}</span></td><td className="px-4 py-2"><div className="flex flex-wrap gap-2">{row.status === 'PENDING_EXPLANATION' && <button onClick={() => followUp(row.id)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">Tindak lanjuti</button>}{isHr && row.status === 'PENDING_EXPLANATION' && <><button onClick={() => resolve(row.id, 'EXCUSE')} className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white">Maafkan</button><button onClick={() => resolve(row.id, 'CONFIRM_ALPHA')} className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white">Konfirmasi Alpa</button></>}</div></td></tr>; })}{rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Tidak ada kasus yang perlu perhatian.</td></tr>}</tbody></table></div>
  </div>;
}
