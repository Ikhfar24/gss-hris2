'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowRight, MapPin } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useSession } from '@/components/providers/SessionProvider';
import { formatDate, formatDateTime } from '@/lib/format';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { MetricCard } from '@/components/ui/metrics';
import { ContextBand, DataRegion, DossierPage, MetricStrip } from '@/components/ui/dossier';
import { Skeleton } from '@/components/ui/skeleton';

interface Option { id: string; name: string }
interface EmployeeListResponse { data: Option[]; meta: { page: number; pageSize: number; total: number } }
interface PlacementRequestRow {
  id: string; requestedById: string; type: 'REASSIGNMENT' | 'MUTATION'; status: string; reason: string; startDate: string; requestedAt: string;
  hrNote?: string | null; hrReviewedAt?: string | null; directorNote?: string | null; directorReviewedAt?: string | null;
  employee: Option; originLocation: { name: string } | null; destinationLocation: { name: string };
}
type PendingAction = { row: PlacementRequestRow; kind: 'hr' | 'director' | 'cancel'; approve?: boolean };

const STATUS: Record<string, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }> = {
  PENDING_HR: { label: 'Menunggu HR', variant: 'warning' }, PENDING_DIRECTOR: { label: 'Menunggu Direktur', variant: 'info' }, APPROVED: { label: 'Disetujui', variant: 'success' }, REJECTED: { label: 'Ditolak', variant: 'danger' }, CANCELLED: { label: 'Dibatalkan', variant: 'neutral' },
};
const TYPE_LABEL = { MUTATION: 'Mutasi', REASSIGNMENT: 'Reassignment' };

export default function PlacementRequestsPage() {
  const { session } = useSession();
  const role = session.role;
  const canCreate = role === 'KOORDINATOR' || role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const canHrReview = role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const canDirectorApprove = role === 'DIREKTUR' || role === 'SYSTEM_ADMIN';
  const [requests, setRequests] = useState<PlacementRequestRow[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [form, setForm] = useState({ employeeId: '', destinationLocationId: '', startDate: '', reason: '' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const token = getToken();
      const calls: Promise<unknown>[] = [apiFetch<PlacementRequestRow[]>('/placement-requests', { token })];
      if (canCreate) calls.push(apiFetch<EmployeeListResponse>('/employees', { token }), apiFetch<Option[]>('/locations', { token }));
      const [requestResult, employeeResult, locationResult] = await Promise.all(calls);
      setRequests(requestResult as PlacementRequestRow[]);
      if (employeeResult) setEmployees((employeeResult as EmployeeListResponse).data);
      if (locationResult) setLocations(locationResult as Option[]);
    } catch (reason) { setError(reason instanceof ApiError || reason instanceof Error ? reason.message : 'Gagal memuat data pengajuan'); }
    finally { setLoading(false); }
  }, [canCreate]);
  useEffect(() => { void load(); }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault(); setSubmitting(true); setError(null);
    try { await apiFetch('/placement-requests', { method: 'POST', token: getToken(), body: form }); setForm({ employeeId: '', destinationLocationId: '', startDate: '', reason: '' }); setShowForm(false); await load(); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Gagal membuat pengajuan'); }
    finally { setSubmitting(false); }
  }

  async function act(note: string) {
    if (!pending) return;
    setSubmitting(true); setError(null);
    const path = pending.kind === 'hr' ? 'hr-review' : pending.kind === 'director' ? 'director-approve' : 'cancel';
    const body = pending.kind === 'cancel' ? undefined : { approve: pending.approve, note: note || undefined };
    try { await apiFetch(`/placement-requests/${pending.row.id}/${path}`, { method: 'PATCH', token: getToken(), body }); setPending(null); await load(); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Gagal memproses pengajuan'); }
    finally { setSubmitting(false); }
  }

  const pendingHr = requests.filter((row) => row.status === 'PENDING_HR').length;
  const pendingDirector = requests.filter((row) => row.status === 'PENDING_DIRECTOR').length;
  const mutations = requests.filter((row) => row.type === 'MUTATION').length;

  return <DossierPage className="space-y-5">
    <ContextBand className="mb-0 border border-border bg-paper px-4 py-4 text-foreground shadow-none sm:px-5 [&_h1]:text-brand [&_.text-white\/70]:text-muted [&_.text-white\/72]:text-muted" title="Pengajuan Penempatan & Mutasi" description="Alur persetujuan dan perpindahan lokasi sesuai jenis tenaga kerja." meta={<span>WORKFLOW PENEMPATAN</span>} actions={canCreate && <Button className="!border-brand !bg-brand !text-white" onClick={() => setShowForm((value) => !value)}>{showForm ? 'Tutup Form' : 'Ajukan Perubahan'}</Button>} />
    {error && <Alert variant="danger" title="Data tidak dapat diproses"><div className="flex flex-wrap items-center gap-3"><span>{error}</span><button type="button" onClick={() => void load()} className="font-semibold underline">Coba lagi</button></div></Alert>}
    {loading ? <SummarySkeleton /> : <MetricStrip className="border border-border shadow-none"><MetricCard label="Total Pengajuan" value={requests.length} detail="Dalam cakupan akses Anda" /><MetricCard label="Menunggu HR" value={pendingHr} tone="warning" /><MetricCard label="Menunggu Direktur" value={pendingDirector} tone="info" /><MetricCard label="Mutasi" value={mutations} detail={`${requests.length - mutations} reassignment`} /></MetricStrip>}
    {showForm && <Card className="shadow-none"><CardHeader><CardTitle>Ajukan Perubahan Penempatan</CardTitle><p className="mt-1 text-body text-muted">Tipe dan jalur persetujuan ditentukan otomatis dari jenis tenaga kerja karyawan.</p></CardHeader><CardContent><form onSubmit={onCreate} aria-busy={submitting} className="grid gap-4 md:grid-cols-2"><Select label="Karyawan" value={form.employeeId} onChange={(value) => setForm({ ...form, employeeId: value })} options={employees} /><Select label="Lokasi tujuan" value={form.destinationLocationId} onChange={(value) => setForm({ ...form, destinationLocationId: value })} options={locations} /><label className="text-sm font-semibold text-foreground">Tanggal mulai<input required type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} className="input mt-1 w-full" /></label><label className="text-sm font-semibold text-foreground md:col-span-2">Alasan<textarea required rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className="input mt-1 w-full" /></label><div className="md:col-span-2"><Button disabled={submitting}>{submitting ? 'Mengirim...' : 'Kirim Pengajuan'}</Button></div></form></CardContent></Card>}
    {loading ? <ListSkeleton /> : requests.length === 0 ? <EmptyState title="Belum ada pengajuan penempatan" description="Pengajuan yang berada dalam cakupan akses Anda akan tampil di sini." /> : <><div className="space-y-3 md:hidden">{requests.map((row) => <RequestCard key={row.id} row={row} actions={<Actions row={row} role={role} sessionId={session.id} canHrReview={canHrReview} canDirectorApprove={canDirectorApprove} onAction={setPending} />} />)}</div><DataRegion className="hidden border border-border shadow-none md:block [&_td]:py-2.5 [&_th]:py-2.5 [&_thead]:bg-surface-subtle [&_thead]:text-muted"><table className="min-w-[920px] text-sm"><thead><tr><th scope="col">Karyawan</th><th scope="col">Perpindahan</th><th scope="col">Efektif</th><th scope="col">Tahap persetujuan</th><th scope="col">Tindakan</th></tr></thead><tbody>{requests.map((row) => <RequestRow key={row.id} row={row} actions={<Actions row={row} role={role} sessionId={session.id} canHrReview={canHrReview} canDirectorApprove={canDirectorApprove} onAction={setPending} />} />)}</tbody></table></DataRegion></>}
    <ActionDialog open={!!pending} title={dialogTitle(pending)} description={pending ? `${pending.row.employee.name}: ${pending.row.originLocation?.name ?? 'Tanpa penempatan asal'} ke ${pending.row.destinationLocation.name}.` : ''} reasonLabel="Catatan keputusan" reasonRequired={pending?.approve === false} confirmLabel={pending?.kind === 'cancel' ? 'Batalkan Pengajuan' : pending?.approve ? 'Setujui' : 'Tolak'} danger={pending?.approve === false || pending?.kind === 'cancel'} busy={submitting} onClose={() => setPending(null)} onConfirm={act} />
  </DossierPage>;
}

function ApprovalContext({ row }: { row: PlacementRequestRow }) { const text = row.status === 'PENDING_HR' ? (row.type === 'MUTATION' ? 'Tahap 1 dari 2: review HR, lalu Direktur' : 'Keputusan akhir oleh HR') : row.status === 'PENDING_DIRECTOR' ? 'Review HR selesai, menunggu keputusan Direktur' : row.status === 'APPROVED' ? 'Seluruh persetujuan selesai' : row.status === 'REJECTED' ? 'Alur persetujuan dihentikan' : 'Pengajuan dibatalkan'; const note = row.directorNote || row.hrNote; const reviewedAt = row.directorReviewedAt || row.hrReviewedAt; return <div className="min-w-0"><Badge variant={(STATUS[row.status] ?? STATUS.CANCELLED).variant}>{(STATUS[row.status] ?? { label: row.status }).label}</Badge><p className="mt-1.5 break-words text-xs text-slate-500 [overflow-wrap:anywhere]">{text}</p>{note && <p className="mt-1 break-words text-xs text-slate-600 [overflow-wrap:anywhere]">Catatan: {note}</p>}{reviewedAt && <p className="mt-1 text-xs text-slate-400">Review terakhir {formatDateTime(reviewedAt)}</p>}</div>; }
function Route({ row }: { row: PlacementRequestRow }) { return <div className="flex min-w-0 items-center gap-2"><span className="min-w-0 break-words [overflow-wrap:anywhere]">{row.originLocation?.name ?? 'Belum ditempatkan'}</span><ArrowRight className="size-4 shrink-0 text-muted" /><span className="min-w-0 break-words font-semibold text-brand [overflow-wrap:anywhere]">{row.destinationLocation.name}</span></div>; }
function RequestRow({ row, actions }: { row: PlacementRequestRow; actions: React.ReactNode }) { return <tr className="border-t border-slate-100 align-top"><td className="px-5 py-4"><p className="font-semibold text-navy">{row.employee.name}</p><p className="mt-1 text-xs text-slate-500">{TYPE_LABEL[row.type]} · Diajukan {formatDate(row.requestedAt)}</p><p className="mt-2 max-w-xs text-xs text-slate-500">{row.reason}</p></td><td className="px-5 py-4"><Route row={row} /></td><td className="whitespace-nowrap px-5 py-4">{formatDate(row.startDate)}</td><td className="max-w-xs px-5 py-4"><ApprovalContext row={row} /></td><td className="px-5 py-4">{actions}</td></tr>; }
function RequestCard({ row, actions }: { row: PlacementRequestRow; actions: React.ReactNode }) { return <Card className="overflow-hidden shadow-none"><CardContent className="min-w-0 p-0"><div className="border-b border-border bg-surface-subtle px-4 py-3"><div className="min-w-0"><p className="break-words font-semibold text-navy [overflow-wrap:anywhere]">{row.employee.name}</p><p className="mt-1 text-xs text-slate-500">{TYPE_LABEL[row.type]} · efektif {formatDate(row.startDate)}</p></div><div className="mt-2"><ApprovalContext row={row} /></div></div><div className="px-4 py-4"><div className="min-w-0 rounded-lg border border-border bg-paper p-3 text-sm"><MapPin className="mr-1 inline size-4 text-brand" /><Route row={row} /></div><p className="mt-3 break-words text-sm text-slate-600 [overflow-wrap:anywhere]">{row.reason}</p></div><div className="border-t border-border bg-surface-subtle px-4 py-3">{actions}</div></CardContent></Card>; }
function Actions({ row, role, sessionId, canHrReview, canDirectorApprove, onAction }: { row: PlacementRequestRow; role: string; sessionId: string; canHrReview: boolean; canDirectorApprove: boolean; onAction: (action: PendingAction) => void }) { const canCancel = ['PENDING_HR', 'PENDING_DIRECTOR'].includes(row.status) && ((role === 'KOORDINATOR' && row.requestedById === sessionId) || canHrReview); return <div className="flex flex-wrap gap-2">{canHrReview && row.status === 'PENDING_HR' && <><Button size="sm" onClick={() => onAction({ row, kind: 'hr', approve: true })}>Setujui HR</Button><Button size="sm" variant="danger" onClick={() => onAction({ row, kind: 'hr', approve: false })}>Tolak</Button></>}{canDirectorApprove && row.status === 'PENDING_DIRECTOR' && <><Button size="sm" onClick={() => onAction({ row, kind: 'director', approve: true })}>Setujui Direktur</Button><Button size="sm" variant="danger" onClick={() => onAction({ row, kind: 'director', approve: false })}>Tolak</Button></>}{canCancel && <Button size="sm" variant="secondary" onClick={() => onAction({ row, kind: 'cancel' })}>Batalkan</Button>}</div>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Option[] }) { return <label className="text-sm font-semibold text-foreground">{label}<select required value={value} onChange={(event) => onChange(event.target.value)} className="input mt-1 w-full"><option value="">Pilih {label.toLowerCase()}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>; }
function dialogTitle(action: PendingAction | null) { if (!action) return ''; if (action.kind === 'cancel') return 'Batalkan pengajuan penempatan?'; return action.approve ? `Setujui sebagai ${action.kind === 'hr' ? 'HR' : 'Direktur'}?` : 'Tolak pengajuan penempatan?'; }
function SummarySkeleton() { return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28 rounded-2xl" />)}</div>; }
function ListSkeleton() { return <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-28 rounded-2xl" />)}</div>; }
