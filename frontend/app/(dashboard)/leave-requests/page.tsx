'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { apiFetch, ApiError, protectedMediaUrl } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useSession } from '@/components/providers/SessionProvider';
import { formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Button } from '@/components/ui/button';
import { ContextBand, DataRegion, DossierPage } from '@/components/ui/dossier';

interface EmployeeOption {
  id: string;
  name: string;
}
interface EmployeeListResponse { data: EmployeeOption[] }

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
  const { session } = useSession();
  const role = session.role;
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [intervention, setIntervention] = useState<{ id: string; approve: boolean } | null>(null);
  const [form, setForm] = useState({ type: 'CUTI', startDate: '', endDate: '', reason: '', employeeId: '' });

  const isHr = role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const isKaryawan = role === 'KARYAWAN';
  const isEmployeeSelfService = ['KARYAWAN', 'KOORDINATOR', 'KEUANGAN', 'MARKETING'].includes(role);
  const usesEmployeePresentation = ['KARYAWAN', 'KEUANGAN', 'MARKETING'].includes(role);
  const canCreate = isEmployeeSelfService || isHr;

  async function load() {
    try {
      const token = getToken();
      const calls: Promise<any>[] = [apiFetch<LeaveRequestRow[]>('/leave-requests', { token })];
      if (isHr) calls.push(apiFetch<EmployeeListResponse>('/employees?pageSize=100', { token }));
      const [reqs, emps] = await Promise.all(calls);
      setRequests(reqs);
      if (emps) setEmployees((emps as EmployeeListResponse).data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat data pengajuan');
    }
  }

  useEffect(() => {
    const requestedType = new URLSearchParams(window.location.search).get('new');
    if (requestedType && TYPE_LABEL[requestedType]) {
      setForm((current) => ({ ...current, type: requestedType }));
      setShowForm(true);
    }
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

  async function intervene(note: string) {
    if (!intervention) return;
    try {
      await apiFetch(`/leave-requests/${intervention.id}/intervene`, { method: 'PATCH', token: getToken(), body: { approve: intervention.approve, note } });
      setIntervention(null);
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
    return (request.status === 'PENDING_COORDINATOR' && role === 'KOORDINATOR' && request.employee.id !== session.employee?.id)
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
    <DossierPage className={`${usesEmployeePresentation ? 'max-w-5xl ' : ''}space-y-5`}>
      {isKaryawan && <Link href="/requests" className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand"><ArrowLeft className="size-4" />Kembali ke Pengajuan</Link>}
       <ContextBand className="mb-0 border border-border bg-paper px-4 py-4 text-foreground shadow-none sm:px-5 [&_h1]:text-brand [&_.text-white\/70]:text-muted [&_.text-white\/72]:text-muted" title="Cuti, Izin & Resign" description={isKaryawan ? 'Ajukan dan pantau status permohonan Anda.' : 'Tinjau permohonan sesuai cakupan dan tahap kewenangan Anda.'} meta={<span>{isKaryawan ? 'PRIBADI' : 'WORK QUEUE · PENGAJUAN'}</span>} actions={canCreate && <Button className="!border-brand !bg-brand !text-white" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Batal' : '+ Ajukan'}</Button>} />

       {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

      {showForm && (
         <form onSubmit={onCreate} aria-busy={submitting} className="grid max-w-3xl gap-4 rounded-xl border border-border bg-paper p-4 shadow-none sm:p-5">
           {isHr && (
             <label className="text-sm font-semibold text-foreground">Karyawan<select required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="input mt-1">
               <option value="">-- Ajukan atas nama karyawan --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
             </select></label>
           )}
           <label className="text-sm font-semibold text-foreground">Jenis pengajuan<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input mt-1">
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
           </select></label>
           <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <label className="text-sm">
              Tanggal mulai
               <input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input mt-1" />
            </label>
            <label className="text-sm">
              Tanggal selesai (opsional)
               <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="input mt-1" />
            </label>
          </div>
           <label className="text-sm font-semibold text-foreground">Alasan<textarea required placeholder="Jelaskan alasan pengajuan" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="input mt-1" rows={3} /></label>
          <label className="text-sm">
            {form.type === 'SAKIT' ? 'Bukti medis (wajib, JPEG/PNG/PDF)' : 'Dokumen pendukung (opsional, JPEG/PNG/PDF)'}
            <input required={form.type === 'SAKIT'} type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 w-full text-sm" />
          </label>
           <Button type="submit" disabled={submitting}>
             {submitting ? 'Mengirim...' : 'Kirim Pengajuan'}
           </Button>
        </form>
      )}

      <div className="space-y-3 md:hidden">{requests.map((request) => { const status = STATUS_LABEL[request.status]; return <article key={request.id} className="min-w-0 rounded-xl bg-white p-4 shadow-card"><div className="flex min-w-0 items-start justify-between gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><CalendarDays className="size-5" /></span><StatusBadge status={request.status} label={status?.label ?? request.status} /></div>{!isKaryawan && <p className="mt-3 break-words text-caption font-semibold text-muted [overflow-wrap:anywhere]">{request.employee.name}</p>}<h2 className="mt-1 break-words font-bold text-navy [overflow-wrap:anywhere]">{TYPE_LABEL[request.type] ?? request.type}</h2><p className="mt-1 text-sm tabular-nums text-slate-500">{formatDate(request.startDate)}{request.endDate ? ` - ${formatDate(request.endDate)}` : ''}</p><p className="mt-3 break-words text-sm text-slate-700 [overflow-wrap:anywhere]">{request.reason}</p>{request.reviewNote && <p className="mt-3 break-words rounded-xl bg-slate-50 p-3 text-xs text-slate-600 [overflow-wrap:anywhere]">{request.reviewNote}</p>}{request.approvals.length > 0 && <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-slate-500">{request.approvals.map((approval) => <p key={approval.id} className="break-words [overflow-wrap:anywhere]">{STAGE_LABEL[approval.stage] ?? approval.stage}: {approval.decision === 'APPROVED' ? 'disetujui' : 'ditolak'}{approval.note ? ` (${approval.note})` : ''} · {formatDate(approval.decidedAt)}</p>)}</div>}{request.documentUrl && <a href={protectedMediaUrl(request.documentUrl)} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand">Lihat dokumen</a>}<div className="mt-3 grid gap-2">{canReview(request) && <div className="grid grid-cols-2 gap-2"><button onClick={() => review(request.id, true)} className="min-h-11 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white">Setujui</button><button onClick={() => review(request.id, false)} className="min-h-11 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white">Tolak</button></div>}{isHr && ['PENDING', 'PENDING_COORDINATOR', 'PENDING_HR', 'PENDING_DIRECTOR'].includes(request.status) && !canReview(request) && <div className="grid grid-cols-2 gap-2"><button onClick={() => setIntervention({ id: request.id, approve: true })} className="min-h-11 rounded-lg border border-green-600 px-3 py-2 text-sm font-semibold text-green-700">Intervensi setujui</button><button onClick={() => setIntervention({ id: request.id, approve: false })} className="min-h-11 rounded-lg border border-red-600 px-3 py-2 text-sm font-semibold text-red-700">Intervensi tolak</button></div>}{['PENDING', 'PENDING_COORDINATOR', 'PENDING_HR', 'PENDING_DIRECTOR'].includes(request.status) && (isHr || (isEmployeeSelfService && request.employee.id === session.employee?.id)) && <button onClick={() => cancel(request.id)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600">Batalkan pengajuan</button>}{isHr && request.type === 'RESIGN' && request.status === 'APPROVED' && new Date(request.startDate).getTime() <= Date.now() && <button onClick={() => finalizeResignation(request.id)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600">Finalisasi resign</button>}</div></article>; })}{requests.length === 0 && <EmptyState title="Belum ada pengajuan" description="Pengajuan cuti, izin, sakit, atau resign dalam cakupan Anda akan tampil di sini." />}</div>
       <DataRegion className="hidden border border-border shadow-none md:block [&_td]:py-2.5 [&_th]:py-2.5 [&_thead]:bg-surface-subtle [&_thead]:text-muted">
        <table className="min-w-[860px] text-sm">
          <thead>
            <tr>
               <th scope="col" className="px-4 py-2">Karyawan</th>
               <th scope="col" className="px-4 py-2">Jenis</th>
               <th scope="col" className="px-4 py-2">Tanggal</th>
               <th scope="col" className="px-4 py-2">Alasan</th>
                <th scope="col" className="px-4 py-2">Status & Riwayat</th>
               <th scope="col" className="px-4 py-2"><span className="sr-only">Tindakan</span></th>
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
                    {formatDate(r.startDate)}
                    {r.endDate ? ` - ${formatDate(r.endDate)}` : ''}
                  </td>
                  <td className="px-4 py-2 max-w-xs">
                    <div>{r.reason}</div>
                    {r.documentUrl && (
                       <a href={protectedMediaUrl(r.documentUrl)} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                        Lihat dokumen
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-2">
                     <StatusBadge status={r.status} label={st.label} />
                     {r.reviewNote && <div className="mt-1 text-xs text-slate-400">{r.reviewNote}</div>}
                     {r.approvals.length > 0 && <div className="mt-2 space-y-1 text-xs text-slate-500">{r.approvals.map((approval) => <div key={approval.id}>{STAGE_LABEL[approval.stage] ?? approval.stage}: {approval.decision === 'APPROVED' ? 'disetujui' : 'ditolak'}{approval.note ? ` (${approval.note})` : ''} · {formatDate(approval.decidedAt)}</div>)}</div>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                       {canReview(r) && (
                        <>
                          <button onClick={() => review(r.id, true)} className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700">Setujui</button>
                          <button onClick={() => review(r.id, false)} className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700">Tolak</button>
                        </>
                       )}
                       {isHr && ['PENDING', 'PENDING_COORDINATOR', 'PENDING_HR', 'PENDING_DIRECTOR'].includes(r.status) && !canReview(r) && <><button onClick={() => setIntervention({ id: r.id, approve: true })} className="rounded-lg border border-green-600 px-2 py-1 text-xs text-green-700">Intervensi setujui</button><button onClick={() => setIntervention({ id: r.id, approve: false })} className="rounded-lg border border-red-600 px-2 py-1 text-xs text-red-700">Intervensi tolak</button></>}
                        {['PENDING', 'PENDING_COORDINATOR', 'PENDING_HR', 'PENDING_DIRECTOR'].includes(r.status) && (isHr || (isEmployeeSelfService && r.employee.id === session.employee?.id)) && (
                        <button onClick={() => cancel(r.id)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">Batalkan</button>
                       )}
                       {isHr && r.type === 'RESIGN' && r.status === 'APPROVED' && new Date(r.startDate).getTime() <= Date.now() && <button onClick={() => finalizeResignation(r.id)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">Finalisasi resign</button>}
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
      </DataRegion>
      <ActionDialog open={!!intervention} title={intervention?.approve ? 'Intervensi setujui pengajuan?' : 'Intervensi tolak pengajuan?'} description="Intervensi HR melewati antrean approval normal dan akan dicatat di audit log." reasonLabel="Alasan intervensi" reasonRequired danger={!intervention?.approve} busy={submitting} onClose={() => setIntervention(null)} onConfirm={intervene} />
    </DossierPage>
  );
}
