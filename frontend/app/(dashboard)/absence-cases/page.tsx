'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CalendarX } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { useSession } from '@/components/providers/SessionProvider';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { MetricCard } from '@/components/ui/metrics';
import { ContextBand, DataRegion, DossierPage, MetricStrip } from '@/components/ui/dossier';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

interface AbsenceCase { id: string; date: string; status: string; explanation: string | null; note: string | null; employee?: { name: string; employeeNumber: string | null } }
interface EmployeeResponse { data: { id: string; name: string }[] }
type PendingAction = { row: AbsenceCase; kind: 'follow-up' | 'excuse' | 'alpha' };

const STATUS: Record<string, { label: string; variant: 'warning' | 'danger' | 'success' }> = {
  PENDING_EXPLANATION: { label: 'Menunggu penjelasan', variant: 'warning' }, CONFIRMED_ALPHA: { label: 'Dikonfirmasi alpa', variant: 'danger' }, EXCUSED: { label: 'Dimaafkan', variant: 'success' },
};

export default function AbsenceCasesPage() {
  const { session } = useSession();
  const role = session.role;
  const canManage = role === 'KOORDINATOR' || role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const isHr = role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const [rows, setRows] = useState<AbsenceCase[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [form, setForm] = useState({ employeeId: '', date: '' });
  const [explanation, setExplanation] = useState({ caseId: '', text: '' });

  async function load() {
    setLoading(true); setError(null);
    try {
      if (!canManage) { setRows(await apiFetch<AbsenceCase[]>('/absence-cases/my')); return; }
      const token = getToken();
      const calls: Promise<unknown>[] = [apiFetch<AbsenceCase[]>('/absence-cases/attention', { token })];
      if (isHr) calls.push(apiFetch<EmployeeResponse>('/employees', { token }));
      const [cases, employeeResult] = await Promise.all(calls);
      setRows(cases as AbsenceCase[]);
      if (employeeResult) setEmployees((employeeResult as EmployeeResponse).data);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Gagal memuat kasus ketidakhadiran'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent) { event.preventDefault(); setBusy(true); setError(null); try { await apiFetch('/absence-cases', { method: 'POST', token: getToken(), body: form }); setForm({ employeeId: '', date: '' }); setShowForm(false); await load(); } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Gagal membuat kasus ketidakhadiran'); } finally { setBusy(false); } }
  async function performAction(reason: string) { if (!pending) return; setBusy(true); setError(null); const path = pending.kind === 'follow-up' ? 'follow-up' : 'resolve'; const body = pending.kind === 'follow-up' ? { note: reason } : { decision: pending.kind === 'excuse' ? 'EXCUSE' : 'CONFIRM_ALPHA', reason }; try { await apiFetch(`/absence-cases/${pending.row.id}/${path}`, { method: 'PATCH', token: getToken(), body }); setPending(null); await load(); } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Gagal memproses kasus'); } finally { setBusy(false); } }
  async function submitExplanation(event: FormEvent) { event.preventDefault(); setBusy(true); setError(null); try { await apiFetch(`/absence-cases/${explanation.caseId}/explanation`, { method: 'PATCH', token: getToken(), body: { explanation: explanation.text } }); setExplanation({ caseId: '', text: '' }); await load(); } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Gagal mengirim penjelasan'); } finally { setBusy(false); } }

  if (!canManage) return <EmployeeCases rows={rows} loading={loading} busy={busy} error={error} explanation={explanation} setExplanation={setExplanation} submitExplanation={submitExplanation} retry={load} />;
  const waiting = rows.filter((row) => row.status === 'PENDING_EXPLANATION').length;
  const explained = rows.filter((row) => row.status === 'PENDING_EXPLANATION' && row.explanation).length;
  const alpha = rows.filter((row) => row.status === 'CONFIRMED_ALPHA').length;

  return <DossierPage className="space-y-5">
    <ContextBand className="mb-0 border border-border bg-paper px-4 py-4 text-foreground shadow-none sm:px-5 [&_h1]:text-brand [&_.text-white\/70]:text-muted [&_.text-white\/72]:text-muted" title="Kasus Ketidakhadiran" description="Tindak lanjuti penjelasan dan keputusan ketidakhadiran dalam cakupan Anda." meta={<span>WORK QUEUE · ABSENSI</span>} actions={isHr && <Button className="!border-brand !bg-brand !text-white" onClick={() => setShowForm((value) => !value)}>{showForm ? 'Tutup Form' : 'Buat Kasus'}</Button>} />
    {error && <Alert variant="danger" title="Kasus tidak dapat diproses"><div className="flex flex-wrap items-center gap-3"><span>{error}</span><button type="button" onClick={() => void load()} className="font-semibold underline">Coba lagi</button></div></Alert>}
    {loading ? <SummarySkeleton /> : <MetricStrip className="border border-border shadow-none"><MetricCard label="Perlu Perhatian" value={rows.length} detail="Dalam cakupan akses Anda" /><MetricCard label="Menunggu Penjelasan" value={waiting} tone="warning" /><MetricCard label="Sudah Ada Penjelasan" value={explained} tone="info" /><MetricCard label="Dikonfirmasi Alpa" value={alpha} tone="danger" /></MetricStrip>}
    {showForm && isHr && <Card className="shadow-none"><CardHeader><CardTitle>Buat Kasus Ketidakhadiran</CardTitle><p className="mt-1 text-sm text-slate-500">Sistem akan memvalidasi penempatan, hari kerja, cuti, hari libur, dan presensi yang berlaku.</p></CardHeader><CardContent><form onSubmit={create} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end"><label className="text-sm font-semibold text-slate-700">Karyawan<select required value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} className="input mt-1 w-full"><option value="">Pilih karyawan</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label className="text-sm font-semibold text-slate-700">Tanggal<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="input mt-1 w-full" /></label><Button disabled={busy}>{busy ? 'Membuat...' : 'Buat Kasus'}</Button></form></CardContent></Card>}
    {loading ? <ListSkeleton /> : rows.length === 0 ? <EmptyState title="Tidak ada kasus yang perlu perhatian" description="Kasus baru atau kasus yang masih memerlukan tindak lanjut akan tampil di sini." /> : <><div className="space-y-3 md:hidden">{rows.map((row) => <CaseCard key={row.id} row={row} isHr={isHr} onAction={setPending} />)}</div><DataRegion className="hidden border border-border shadow-none md:block [&_td]:py-2.5 [&_th]:py-2.5 [&_thead]:bg-surface-subtle [&_thead]:text-muted"><table className="min-w-[880px] text-sm"><thead><tr><th scope="col">Karyawan</th><th scope="col">Tanggal</th><th scope="col">Penjelasan & catatan</th><th scope="col">Status</th><th scope="col">Tindakan</th></tr></thead><tbody>{rows.map((row) => <CaseRow key={row.id} row={row} isHr={isHr} onAction={setPending} />)}</tbody></table></DataRegion></>}
    <ActionDialog open={!!pending} title={dialogCopy(pending).title} description={pending ? `${pending.row.employee?.name ?? 'Karyawan'} · ${formatDate(pending.row.date)}. ${dialogCopy(pending).description}` : ''} reasonLabel={pending?.kind === 'follow-up' ? 'Catatan tindak lanjut' : 'Alasan keputusan'} reasonRequired confirmLabel={dialogCopy(pending).confirm} danger={pending?.kind === 'alpha'} busy={busy} onClose={() => setPending(null)} onConfirm={performAction} />
  </DossierPage>;
}

function EmployeeCases({ rows, loading, busy, error, explanation, setExplanation, submitExplanation, retry }: { rows: AbsenceCase[]; loading: boolean; busy: boolean; error: string | null; explanation: { caseId: string; text: string }; setExplanation: (value: { caseId: string; text: string }) => void; submitExplanation: (event: FormEvent) => void; retry: () => Promise<void> }) { return <div className="mx-auto max-w-2xl space-y-5"><PageHeader title="Penjelasan Ketidakhadiran" description="Berikan konteks yang jelas agar kasus dapat ditinjau oleh HR." />{error && <Alert variant="danger" title="Data tidak dapat diproses"><span>{error}</span> <button type="button" onClick={() => void retry()} className="font-semibold underline">Coba lagi</button></Alert>}{loading ? <ListSkeleton /> : rows.length === 0 ? <EmptyState title="Tidak ada kasus ketidakhadiran" description="Anda tidak memiliki kasus yang perlu dijelaskan saat ini." /> : <div className="space-y-3">{rows.map((row) => { const status = STATUS[row.status] ?? { label: row.status, variant: 'warning' as const }; return <button key={row.id} type="button" onClick={() => row.status === 'PENDING_EXPLANATION' && setExplanation({ caseId: row.id, text: row.explanation ?? '' })} disabled={row.status !== 'PENDING_EXPLANATION'} className="flex min-h-20 w-full items-center justify-between gap-4 rounded-2xl border bg-white p-4 text-left shadow-card disabled:cursor-default"><span><span className="block font-semibold text-navy">{formatDate(row.date)}</span><span className="mt-1 block text-xs text-slate-500">{row.explanation || 'Penjelasan belum diberikan'}</span></span><Badge variant={status.variant}>{status.label}</Badge></button>; })}</div>}{explanation.caseId && <Card><CardHeader><CardTitle>Penjelasan Anda</CardTitle></CardHeader><CardContent><form onSubmit={submitExplanation} className="grid gap-3"><textarea required minLength={3} placeholder="Jelaskan alasan ketidakhadiran" value={explanation.text} onChange={(event) => setExplanation({ ...explanation, text: event.target.value })} className="input w-full" rows={4} /><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setExplanation({ caseId: '', text: '' })}>Batal</Button><Button disabled={busy}>{busy ? 'Mengirim...' : 'Kirim Penjelasan'}</Button></div></form></CardContent></Card>}</div>; }
function CaseStatus({ row }: { row: AbsenceCase }) { const status = STATUS[row.status] ?? { label: row.status, variant: 'warning' as const }; return <Badge variant={status.variant}>{status.label}</Badge>; }
function Notes({ row }: { row: AbsenceCase }) { return <div className="space-y-2">{row.explanation ? <div><p className="text-caption font-semibold uppercase tracking-wide text-muted">Penjelasan karyawan</p><p className="mt-1 break-words text-body text-foreground">{row.explanation}</p></div> : <p className="text-body italic text-muted">Belum ada penjelasan</p>}{row.note && <div className="rounded-xl bg-surface-subtle p-3"><p className="text-caption font-semibold text-muted">Catatan tindak lanjut / keputusan</p><p className="mt-1 break-words text-caption text-foreground">{row.note}</p></div>}</div>; }
function Actions({ row, isHr, onAction }: { row: AbsenceCase; isHr: boolean; onAction: (action: PendingAction) => void }) { if (row.status !== 'PENDING_EXPLANATION') return <span className="text-xs text-slate-400">Tidak ada tindakan</span>; return <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => onAction({ row, kind: 'follow-up' })}>Tindak lanjuti</Button>{isHr && <><Button size="sm" onClick={() => onAction({ row, kind: 'excuse' })}>Maafkan</Button><Button size="sm" variant="danger" onClick={() => onAction({ row, kind: 'alpha' })}>Konfirmasi Alpa</Button></>}</div>; }
function CaseRow({ row, ...props }: { row: AbsenceCase; isHr: boolean; onAction: (action: PendingAction) => void }) { return <tr className="border-t border-slate-100 align-top"><td className="px-5 py-4"><p className="font-semibold text-navy">{row.employee?.name ?? '-'}</p>{row.employee?.employeeNumber && <p className="mt-1 text-xs text-slate-500">{row.employee.employeeNumber}</p>}</td><td className="whitespace-nowrap px-5 py-4">{formatDate(row.date)}</td><td className="max-w-md px-5 py-4"><Notes row={row} /></td><td className="px-5 py-4"><CaseStatus row={row} /></td><td className="px-5 py-4"><Actions row={row} {...props} /></td></tr>; }
function CaseCard({ row, ...props }: { row: AbsenceCase; isHr: boolean; onAction: (action: PendingAction) => void }) { return <Card className="overflow-hidden shadow-none"><CardContent className="p-0"><div className="flex items-start justify-between gap-3 border-b border-border bg-surface-subtle px-4 py-3"><span className="grid size-10 place-items-center rounded-lg border border-border bg-paper text-warning"><CalendarX className="size-5" /></span><CaseStatus row={row} /></div><div className="px-4 py-4"><p className="font-semibold text-navy">{row.employee?.name ?? '-'}</p><p className="mt-1 text-sm text-slate-500">{formatDate(row.date)}</p><div className="mt-4"><Notes row={row} /></div></div><div className="border-t border-border bg-surface-subtle px-4 py-3"><Actions row={row} {...props} /></div></CardContent></Card>; }
function dialogCopy(action: PendingAction | null) { if (action?.kind === 'follow-up') return { title: 'Simpan tindak lanjut?', description: 'Catatan ini akan terlihat sebagai konteks penanganan kasus.', confirm: 'Simpan Catatan' }; if (action?.kind === 'excuse') return { title: 'Maafkan ketidakhadiran?', description: 'Kasus akan ditutup sebagai ketidakhadiran yang dimaafkan.', confirm: 'Maafkan' }; if (action?.kind === 'alpha') return { title: 'Konfirmasi sebagai alpa?', description: 'Keputusan ini akan tercatat sebagai konfirmasi alpa.', confirm: 'Konfirmasi Alpa' }; return { title: '', description: '', confirm: 'Konfirmasi' }; }
function SummarySkeleton() { return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-24 rounded-2xl" />)}</div>; }
function ListSkeleton() { return <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-24 rounded-2xl" />)}</div>; }
