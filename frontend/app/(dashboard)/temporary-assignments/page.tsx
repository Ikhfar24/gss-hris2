'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ApiError, apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useSession } from '@/components/providers/SessionProvider';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { MetricCard } from '@/components/ui/metrics';
import { ContextBand, DataRegion, DossierPage, MetricStrip } from '@/components/ui/dossier';
import { Skeleton } from '@/components/ui/skeleton';

interface Assignment { id: string; createdById: string; startDate: string; endDate: string; reason: string; status: string; approvalNote: string | null; employee: { id: string; name: string }; originPlacement: { id: string; location: { name: string } }; location: { id: string; name: string } }
interface Option { id: string; name: string }
interface EmployeeResponse { data: Option[] }
interface Placement { id: string; employeeId: string; location: { name: string } }
type PendingAction = { row: Assignment; path: 'review' | 'cancel' | 'complete'; approve?: boolean; title: string; required?: boolean; danger?: boolean };
type Phase = { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'neutral'; key: 'current' | 'upcoming' | 'completed' | 'other' };

const STATUS: Record<string, string> = { PENDING: 'Menunggu persetujuan HR', APPROVED: 'Disetujui', REJECTED: 'Ditolak', CANCELLED: 'Dibatalkan', COMPLETED: 'Selesai' };

function dateKey(value: string) { return value.slice(0, 10); }
function todayKey() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function phase(row: Assignment): Phase {
  if (row.status === 'COMPLETED') return { label: 'Selesai', variant: 'success', key: 'completed' };
  if (row.status === 'APPROVED' && dateKey(row.endDate) < todayKey()) return { label: 'Menunggu penyelesaian', variant: 'warning', key: 'other' };
  if (row.status === 'APPROVED' && dateKey(row.startDate) > todayKey()) return { label: 'Akan datang', variant: 'info', key: 'upcoming' };
  if (row.status === 'APPROVED') return { label: 'Berjalan', variant: 'success', key: 'current' };
  if (row.status === 'PENDING') return { label: 'Menunggu review', variant: 'warning', key: 'other' };
  if (row.status === 'REJECTED') return { label: 'Ditolak', variant: 'danger', key: 'other' };
  return { label: 'Dibatalkan', variant: 'neutral', key: 'other' };
}

export default function TemporaryAssignmentsPage() {
  const { session } = useSession();
  const isHr = session.role === 'ADMIN_HR' || session.role === 'SYSTEM_ADMIN';
  const [rows, setRows] = useState<Assignment[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ employeeId: '', originPlacementId: '', locationId: '', startDate: '', endDate: '', reason: '', coordinationNote: '' });

  async function load() {
    setLoading(true); setError(null);
    try { const [assignments, employeeResult, locationResult, placementResult] = await Promise.all([apiFetch<Assignment[]>('/temporary-assignments'), apiFetch<EmployeeResponse>('/employees?pageSize=100'), apiFetch<Option[]>('/locations'), apiFetch<Placement[]>('/placements/active')]); setRows(assignments); setEmployees(employeeResult.data); setLocations(locationResult); setPlacements(placementResult); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Gagal memuat penugasan sementara'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(null); try { await apiFetch('/temporary-assignments', { method: 'POST', body: { ...form, coordinationNote: form.coordinationNote || undefined } }); setForm({ employeeId: '', originPlacementId: '', locationId: '', startDate: '', endDate: '', reason: '', coordinationNote: '' }); setShowForm(false); await load(); } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Gagal mengajukan penugasan'); } finally { setBusy(false); } }
  async function submitAction(note: string) { if (!pending) return; setBusy(true); setError(null); try { await apiFetch(`/temporary-assignments/${pending.row.id}/${pending.path}`, { method: 'PATCH', body: pending.path === 'review' ? { approve: pending.approve, note: note || undefined } : { reason: note || undefined } }); setPending(null); await load(); } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Gagal memproses penugasan'); } finally { setBusy(false); } }
  const originPlacements = placements.filter((item) => item.employeeId === form.employeeId);
  const phases = rows.map(phase);

  return <DossierPage className="space-y-5">
    <ContextBand className="mb-0 border border-border bg-paper px-4 py-4 text-foreground shadow-none sm:px-5 [&_h1]:text-brand [&_.text-white\/70]:text-muted [&_.text-white\/72]:text-muted" title="Penugasan Sementara" description="Pantau periode efektif tanpa mengubah penempatan utama karyawan." meta={<span>WORKFLOW PENUGASAN</span>} actions={<Button className="!border-brand !bg-brand !text-white" onClick={() => setShowForm((value) => !value)}>{showForm ? 'Tutup Form' : 'Ajukan Penugasan'}</Button>} />
    {error && <Alert variant="danger" title="Penugasan tidak dapat diproses"><div className="flex flex-wrap items-center gap-3"><span>{error}</span><button type="button" onClick={() => void load()} className="font-semibold underline">Coba lagi</button></div></Alert>}
    {loading ? <SummarySkeleton /> : <MetricStrip className="border border-border shadow-none"><MetricCard label="Berjalan" value={phases.filter((item) => item.key === 'current').length} tone="success" /><MetricCard label="Akan Datang" value={phases.filter((item) => item.key === 'upcoming').length} tone="info" /><MetricCard label="Menunggu Review" value={rows.filter((row) => row.status === 'PENDING').length} tone="warning" /><MetricCard label="Selesai" value={phases.filter((item) => item.key === 'completed').length} /></MetricStrip>}
    {showForm && <Card className="shadow-none"><CardHeader><CardTitle>Detail Penugasan</CardTitle><p className="mt-1 text-sm text-slate-500">Pilih penempatan asal yang tetap berlaku selama seluruh periode tugas.</p></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><Select label="Karyawan" value={form.employeeId} onChange={(value) => setForm({ ...form, employeeId: value, originPlacementId: '' })} options={employees} /><Select label="Penempatan asal" value={form.originPlacementId} onChange={(value) => setForm({ ...form, originPlacementId: value })} options={originPlacements.map((item) => ({ id: item.id, name: item.location.name }))} /><Select label="Lokasi tujuan" value={form.locationId} onChange={(value) => setForm({ ...form, locationId: value })} options={locations} /><FieldDate label="Tanggal mulai" value={form.startDate} onChange={(value) => setForm({ ...form, startDate: value })} /><FieldDate label="Tanggal selesai" value={form.endDate} onChange={(value) => setForm({ ...form, endDate: value })} /><label className="text-sm font-semibold text-slate-700">Alasan<textarea required rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className="input mt-1 w-full" /></label><label className="text-sm font-semibold text-slate-700 md:col-span-2">Catatan koordinasi <span className="font-normal text-slate-400">(opsional)</span><textarea rows={2} value={form.coordinationNote} onChange={(event) => setForm({ ...form, coordinationNote: event.target.value })} className="input mt-1 w-full" /></label><div className="md:col-span-2"><Button disabled={busy}>{busy ? 'Mengirim...' : 'Kirim Pengajuan'}</Button></div></form></CardContent></Card>}
    {loading ? <ListSkeleton /> : rows.length === 0 ? <EmptyState title="Belum ada penugasan sementara" description="Penugasan dalam cakupan Anda akan tampil di sini." /> : <><div className="space-y-3 md:hidden">{rows.map((row) => <AssignmentCard key={row.id} row={row} sessionId={session.id} isHr={isHr} onAction={setPending} />)}</div><DataRegion className="hidden border border-border shadow-none md:block [&_td]:py-2.5 [&_th]:py-2.5 [&_thead]:bg-surface-subtle [&_thead]:text-muted"><table className="min-w-[900px] text-sm"><thead><tr><th scope="col">Karyawan</th><th scope="col">Lokasi tugas</th><th scope="col">Periode</th><th scope="col">Kondisi</th><th scope="col">Tindakan</th></tr></thead><tbody>{rows.map((row) => <AssignmentRow key={row.id} row={row} sessionId={session.id} isHr={isHr} onAction={setPending} />)}</tbody></table></DataRegion></>}
    <ActionDialog open={!!pending} title={pending?.title ?? ''} description={pending ? `${pending.row.employee.name}, ${formatDate(pending.row.startDate)} sampai ${formatDate(pending.row.endDate)}.` : ''} reasonLabel={pending?.path === 'review' ? 'Catatan review' : 'Catatan tindakan'} reasonRequired={pending?.required} confirmLabel={pending?.approve === false ? 'Tolak' : pending?.path === 'cancel' ? 'Batalkan Penugasan' : pending?.path === 'complete' ? 'Tandai Selesai' : 'Setujui'} danger={pending?.danger} busy={busy} onClose={() => setPending(null)} onConfirm={submitAction} />
  </DossierPage>;
}

function Actions({ row, sessionId, isHr, onAction }: { row: Assignment; sessionId: string; isHr: boolean; onAction: (action: PendingAction) => void }) { const canCancel = (isHr || row.createdById === sessionId) && ['PENDING', 'APPROVED'].includes(row.status); const canComplete = isHr && row.status === 'APPROVED' && dateKey(row.endDate) <= todayKey(); return <div className="flex flex-wrap gap-2">{isHr && row.status === 'PENDING' && <><Button size="sm" onClick={() => onAction({ row, path: 'review', approve: true, title: 'Setujui penugasan sementara?' })}>Setujui</Button><Button size="sm" variant="danger" onClick={() => onAction({ row, path: 'review', approve: false, title: 'Tolak penugasan sementara?', required: true, danger: true })}>Tolak</Button></>}{canCancel && <Button size="sm" variant="secondary" onClick={() => onAction({ row, path: 'cancel', title: 'Batalkan penugasan sementara?', danger: true })}>Batalkan</Button>}{canComplete && <Button size="sm" variant="secondary" onClick={() => onAction({ row, path: 'complete', title: 'Selesaikan penugasan sementara?' })}>Selesaikan</Button>}</div>; }
function PhaseBadge({ row }: { row: Assignment }) { const currentPhase = phase(row); return <div className="min-w-0"><Badge variant={currentPhase.variant}>{currentPhase.label}</Badge><p className="mt-1.5 break-words text-xs text-slate-500 [overflow-wrap:anywhere]">{STATUS[row.status] ?? row.status}</p>{row.approvalNote && <p className="mt-1 break-words text-xs text-slate-600 [overflow-wrap:anywhere]">Catatan: {row.approvalNote}</p>}</div>; }
function AssignmentCard({ row, ...props }: { row: Assignment; sessionId: string; isHr: boolean; onAction: (action: PendingAction) => void }) { return <Card className="overflow-hidden shadow-none"><CardContent className="min-w-0 p-0"><div className="border-b border-border bg-surface-subtle px-4 py-3"><div className="min-w-0"><p className="break-words font-semibold text-navy [overflow-wrap:anywhere]">{row.employee.name}</p><p className="mt-1 text-xs text-slate-500">{formatDate(row.startDate)} - {formatDate(row.endDate)}</p></div><div className="mt-2"><PhaseBadge row={row} /></div></div><div className="px-4 py-4"><div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg border border-border bg-paper p-3 text-sm"><span className="min-w-0 break-words [overflow-wrap:anywhere]">{row.originPlacement.location.name}</span><ArrowRight className="size-4 shrink-0 text-slate-300" /><span className="min-w-0 break-words font-semibold text-navy [overflow-wrap:anywhere]">{row.location.name}</span></div><p className="mt-3 break-words text-sm text-slate-600 [overflow-wrap:anywhere]">{row.reason}</p></div><div className="border-t border-border bg-surface-subtle px-4 py-3"><Actions row={row} {...props} /></div></CardContent></Card>; }
function AssignmentRow({ row, ...props }: { row: Assignment; sessionId: string; isHr: boolean; onAction: (action: PendingAction) => void }) { return <tr className="border-t border-slate-100 align-top"><td className="px-5 py-4"><p className="font-semibold text-navy">{row.employee.name}</p><p className="mt-1 max-w-xs text-xs text-slate-500">{row.reason}</p></td><td className="px-5 py-4"><div className="flex items-center gap-2"><span>{row.originPlacement.location.name}</span><ArrowRight className="size-4 text-slate-300" /><span className="font-semibold text-navy">{row.location.name}</span></div></td><td className="whitespace-nowrap px-5 py-4">{formatDate(row.startDate)}<span className="mx-1 text-slate-300">-</span>{formatDate(row.endDate)}</td><td className="px-5 py-4"><PhaseBadge row={row} /></td><td className="px-5 py-4"><Actions row={row} {...props} /></td></tr>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Option[] }) { return <label className="text-sm font-semibold text-foreground">{label}<select required value={value} onChange={(event) => onChange(event.target.value)} className="input mt-1 w-full"><option value="">Pilih {label.toLowerCase()}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>; }
function FieldDate({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm font-semibold text-foreground">{label}<input required type="date" value={value} onChange={(event) => onChange(event.target.value)} className="input mt-1 w-full" /></label>; }
function SummarySkeleton() { return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-24 rounded-2xl" />)}</div>; }
function ListSkeleton() { return <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-28 rounded-2xl" />)}</div>; }
