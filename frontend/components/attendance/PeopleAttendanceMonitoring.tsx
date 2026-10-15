'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock3, Search, UserX } from 'lucide-react';
import { ApiError, apiFetch } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import { useSession } from '@/components/providers/SessionProvider';
import { EmployeeAvatar } from '@/components/employee/EmployeeAvatar';
import { AttendanceDetailView } from './AttendanceDetailView';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Alert, EmptyState, LoadingState } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ContextBand, DataRegion } from '@/components/ui/dossier';

type EmploymentType = '' | 'TENAGA_ARSIPARIS' | 'TENAGA_BORONGAN' | 'STAFF_OFFICE';
type FilterState = 'ALL' | 'ATTENDED' | 'LATE' | 'NOT_ATTENDED' | 'NEEDS_REVIEW' | 'ON_LEAVE';
interface MonitorAttendance { id: string; checkInAt: string | null; checkOutAt: string | null; latenessStatus: string; validationStatus: string; payableStatus: string; reviewNote: string | null }
interface Person { employee: { id: string; name: string; photoUrl: string | null; employmentType: string; jobTitle: string | null }; location: { id: string; name: string; address: string | null }; state: 'CHECKED_IN' | 'CHECKED_OUT' | 'NOT_ATTENDED' | 'ON_LEAVE'; attendance: MonitorAttendance | null; approvedLeave: { type: string } | null }
interface MonitoringResponse { date: string; summary: { totalScheduled: number; expectedToAttend: number; attended: number; checkedIn: number; checkedOut: number; notAttended: number; onLeave: number; late: number; needsReview: number }; people: Person[] }

const typeOptions = [{ value: '' as const, label: 'Semua' }, { value: 'TENAGA_ARSIPARIS' as const, label: 'Arsiparis' }, { value: 'TENAGA_BORONGAN' as const, label: 'Borongan' }, { value: 'STAFF_OFFICE' as const, label: 'Staff Kantor' }];
const stateOptions: { value: FilterState; label: string }[] = [{ value: 'ALL', label: 'Semua' }, { value: 'ATTENDED', label: 'Hadir' }, { value: 'LATE', label: 'Terlambat' }, { value: 'NOT_ATTENDED', label: 'Belum hadir' }, { value: 'NEEDS_REVIEW', label: 'Perlu tinjau' }, { value: 'ON_LEAVE', label: 'Cuti/izin' }];

export function PeopleAttendanceMonitoring({ role, context = role === 'KOORDINATOR' ? 'team' : 'organization' }: { role: string; context?: 'team' | 'organization' }) {
  const { session } = useSession();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const initialType = searchParams.get('employmentType');
  const initialState = searchParams.get('state') ?? (searchParams.get('validationStatus') === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'ALL');
  const allowedTypes: Exclude<EmploymentType, ''>[] = role === 'KOORDINATOR' ? session.coordinatorScopeTypes : ['TENAGA_ARSIPARIS', 'TENAGA_BORONGAN', 'STAFF_OFFICE'];
  const [type, setType] = useState<EmploymentType>(allowedTypes.includes(initialType as never) ? initialType as EmploymentType : allowedTypes.length === 1 ? allowedTypes[0] : '');
  const [state, setState] = useState<FilterState>(stateOptions.some((option) => option.value === initialState) ? initialState as FilterState : 'ALL');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<MonitoringResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [note, setNote] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState({ checkInAt: '', checkOutAt: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const canReview = ['ADMIN_HR', 'SYSTEM_ADMIN', 'KOORDINATOR'].includes(role);
  const canCorrect = role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';

  async function load(selectedType = type) {
    const current = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedType) params.set('employmentType', selectedType);
      const date = searchParams.get('date');
      const locationId = searchParams.get('locationId');
      if (date) params.set('date', date);
      if (locationId) params.set('locationId', locationId);
      const result = await apiFetch<MonitoringResponse>(`/attendance/monitoring${params.size ? `?${params}` : ''}`);
      if (current === requestId.current) setData(result);
    } catch (reason) {
      if (current === requestId.current) setError(reason instanceof ApiError ? reason.message : 'Gagal memuat monitoring absensi');
    } finally { if (current === requestId.current) setLoading(false); }
  }
  useEffect(() => {
    const requestedType = searchParams.get('employmentType');
    const nextType = allowedTypes.includes(requestedType as never) ? requestedType as EmploymentType : allowedTypes.length === 1 ? allowedTypes[0] : '';
    const requestedState = searchParams.get('state') ?? (searchParams.get('validationStatus') === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'ALL');
    setType(nextType);
    setState(stateOptions.some((option) => option.value === requestedState) ? requestedState as FilterState : 'ALL');
    void load(nextType);
  }, [queryKey]);

  function toLocalInput(value: string | null) { if (!value) return ''; const date = new Date(value); const pad = (number: number) => String(number).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
  async function openDetail(id: string) { try { const result: any = await apiFetch(`/attendance/${id}`); setDetail(result); setNote(''); setCorrecting(false); setCorrection({ checkInAt: toLocalInput(result.checkInAt), checkOutAt: toLocalInput(result.checkOutAt), reason: '' }); } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Gagal memuat bukti presensi'); } }
  async function review(decision: 'APPROVED' | 'REJECTED') { if (!detail || note.trim().length < 5) return; setBusy(true); try { await apiFetch(`/attendance/${detail.id}/review`, { method: 'POST', body: { decision, note: note.trim() } }); setDetail(null); await load(); } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Gagal menyimpan review'); } finally { setBusy(false); } }
  async function submitCorrection() { if (!detail || correction.reason.trim().length < 5) return; setBusy(true); try { await apiFetch(`/attendance/${detail.id}/correct`, { method: 'PATCH', body: { checkInAt: correction.checkInAt ? new Date(correction.checkInAt).toISOString() : undefined, checkOutAt: correction.checkOutAt ? new Date(correction.checkOutAt).toISOString() : undefined, reason: correction.reason.trim() } }); setDetail(null); await load(); } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Gagal menyimpan koreksi'); } finally { setBusy(false); } }

  const people = (data?.people ?? []).filter((person) => {
    const deepEmployeeId = searchParams.get('employeeId');
    const matchesSearch = (!deepEmployeeId || person.employee.id === deepEmployeeId) && (!search.trim() || `${person.employee.name} ${person.location.name}`.toLowerCase().includes(search.trim().toLowerCase()));
    const matchesState = state === 'ALL'
      || (state === 'ATTENDED' && !!person.attendance?.checkInAt)
      || (state === 'LATE' && person.attendance?.latenessStatus === 'LATE')
      || (state === 'NEEDS_REVIEW' && person.attendance?.validationStatus === 'NEEDS_REVIEW')
      || person.state === state;
    return matchesSearch && matchesState;
  });
  const visibleTypeOptions = typeOptions.filter((option) => !option.value || allowedTypes.includes(option.value));

  return <section id="monitoring" aria-busy={loading} className="min-w-0 scroll-mt-24">
    <ContextBand title={`Monitoring Presensi ${context === 'team' ? 'Tim' : 'Organisasi'}`} description="Orang dan aktivitas presensi dalam cakupan kewenangan Anda." meta={<span>{context === 'team' ? 'TIM' : 'ORGANISASI'} · AKTIVITAS HARI INI</span>} />
    {error && <Alert variant="danger">{error}</Alert>}
    {data && <div className="mb-4 mt-4 grid grid-cols-4 divide-x divide-border overflow-hidden rounded-xl bg-paper text-center shadow-sheet"><Metric value={data.summary.attended} label="Hadir" onClick={() => setState('ATTENDED')} /><Metric value={data.summary.late} label="Terlambat" onClick={() => setState('LATE')} /><Metric value={data.summary.notAttended} label="Belum" onClick={() => setState('NOT_ATTENDED')} /><Metric value={data.summary.needsReview} label="Tinjau" onClick={() => setState('NEEDS_REVIEW')} /></div>}
    <div className="mb-4 min-w-0 space-y-3">
      <div className="relative">
        <label className="sr-only" htmlFor="attendance-people-search">Cari nama atau lokasi</label>
        <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" />
        <input id="attendance-people-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="input pl-9" placeholder="Cari nama atau lokasi" />
      </div>
      <div className="max-w-full overflow-x-auto overscroll-x-contain pb-1"><SegmentedControl aria-label="Filter status absensi" value={state} onValueChange={setState} options={stateOptions} /></div>
      {visibleTypeOptions.length > 2 && (
        <>
          <div className="hidden max-w-full overflow-x-auto overscroll-x-contain pb-1 sm:block"><SegmentedControl aria-label="Filter jenis tenaga" value={type} onValueChange={(next) => { setType(next); void load(next); }} options={visibleTypeOptions} /></div>
          <div className="flex items-center gap-2 sm:hidden">
            <label htmlFor="mobile-type-filter" className="shrink-0 text-caption font-semibold text-muted">Jenis Tenaga:</label>
            <select
              id="mobile-type-filter"
              value={type}
              onChange={(e) => {
                const next = e.target.value as EmploymentType;
                setType(next);
                void load(next);
              }}
              className="input h-9 min-h-0 flex-1 py-1 text-xs"
            >
              {visibleTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </>
      )}
      {loading && data && <p className="text-caption text-muted" role="status">Memperbarui daftar tanpa menutup data sebelumnya...</p>}
    </div>
    {!data && loading ? <LoadingState label="Memuat monitoring presensi" className="space-y-2">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}</LoadingState> : <>
      <div className="divide-y overflow-hidden rounded-xl bg-paper shadow-sheet md:hidden">{people.map((person) => <PersonRow key={person.employee.id} person={person} onOpen={openDetail} />)}{!people.length && <EmptyState title="Tidak ada orang pada filter ini" />}</div>
      <DataRegion className="hidden md:block"><table className="min-w-[820px] text-sm"><thead><tr><th>Karyawan</th><th>Lokasi</th><th>Masuk</th><th>Pulang</th><th>Status</th><th></th></tr></thead><tbody>{people.map((person) => <tr key={person.employee.id}><td className="font-semibold">{person.employee.name}<span className="block text-xs font-normal text-slate-400">{person.employee.jobTitle ?? person.employee.employmentType}</span></td><td>{person.location.name}</td><td>{formatTime(person.attendance?.checkInAt)}</td><td>{formatTime(person.attendance?.checkOutAt)}</td><td><State person={person} /></td><td className="text-right">{person.attendance && <Button size="sm" variant="secondary" onClick={() => openDetail(person.attendance!.id)}>{person.attendance.validationStatus === 'NEEDS_REVIEW' ? 'Tinjau' : 'Detail'}</Button>}</td></tr>)}</tbody></table></DataRegion>
    </>}
    <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}><DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">{detail && <><DialogTitle>{detail.validationStatus === 'NEEDS_REVIEW' ? 'Tinjau Bukti Presensi' : 'Detail Presensi'}</DialogTitle><DialogDescription>Bukti historis ditampilkan sebelum tindakan. Keputusan dicatat permanen.</DialogDescription><div className="mt-4"><AttendanceDetailView attendance={detail} /></div>{detail.validationStatus === 'NEEDS_REVIEW' && canReview && <div className="sticky bottom-0 mt-5 rounded-2xl border bg-white/95 p-4 shadow-lift backdrop-blur"><label className="text-sm font-semibold">Alasan keputusan<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="input mt-2 h-auto w-full" placeholder="Minimal 5 karakter" /></label><div className="mt-3 grid grid-cols-2 gap-2"><Button disabled={busy || note.trim().length < 5} onClick={() => review('APPROVED')}>Setujui</Button><Button variant="danger" disabled={busy || note.trim().length < 5} onClick={() => review('REJECTED')}>Tolak</Button></div></div>}{canCorrect && <div className="mt-4 border-t pt-4"><button type="button" onClick={() => setCorrecting((value) => !value)} className="text-sm font-semibold text-brand">{correcting ? 'Tutup koreksi' : 'Koreksi administratif'}</button>{correcting && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs">Check-in<input type="datetime-local" value={correction.checkInAt} onChange={(event) => setCorrection({ ...correction, checkInAt: event.target.value })} className="input mt-1" /></label><label className="text-xs">Check-out<input type="datetime-local" value={correction.checkOutAt} onChange={(event) => setCorrection({ ...correction, checkOutAt: event.target.value })} className="input mt-1" /></label><label className="text-xs sm:col-span-2">Alasan koreksi<textarea value={correction.reason} onChange={(event) => setCorrection({ ...correction, reason: event.target.value })} rows={2} className="input mt-1 h-auto" /></label><Button className="sm:col-span-2" disabled={busy || correction.reason.trim().length < 5} onClick={submitCorrection}>Simpan Koreksi</Button></div>}</div>}</>}</DialogContent></Dialog>
  </section>;
}

function Metric({ value, label, onClick }: { value: number; label: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="min-h-11 px-1 transition-colors hover:text-brand active:bg-surface-subtle motion-reduce:transition-none"><span className="block text-xl font-bold tabular-nums text-brand">{value}</span><span className="block text-caption text-muted">{label}</span></button>; }
function PersonRow({ person, onOpen }: { person: Person; onOpen: (id: string) => void }) { return <article className="flex min-w-0 gap-3 p-3.5"><EmployeeAvatar name={person.employee.name} photoUrl={person.employee.photoUrl} size="sm" /><div className="min-w-0 flex-1"><div className="min-w-0"><h2 className="break-words text-sm font-bold leading-snug text-navy [overflow-wrap:anywhere]">{person.employee.name}</h2><p className="mt-0.5 break-words text-xs leading-relaxed text-slate-500 [overflow-wrap:anywhere]">{person.employee.jobTitle ?? person.employee.employmentType} · {person.location.name}</p></div><div className="mt-2 flex min-w-0 flex-wrap"><State person={person} /></div>{person.attendance ? <p className="mt-2 break-words text-xs text-slate-500">{formatTime(person.attendance.checkInAt)} - {person.attendance.checkOutAt ? formatTime(person.attendance.checkOutAt) : 'belum check-out'}</p> : <p className="mt-2 break-words text-xs text-slate-500">Belum ada aktivitas pada {formatDate(new Date())}</p>}{person.attendance && <button type="button" onClick={() => onOpen(person.attendance!.id)} className="mt-2 min-h-11 text-xs font-bold text-brand">{person.attendance.validationStatus === 'NEEDS_REVIEW' ? 'Tinjau bukti' : 'Lihat detail'}</button>}</div></article>; }
function State({ person }: { person: Person }) { const review = person.attendance?.validationStatus === 'NEEDS_REVIEW'; const late = person.attendance?.latenessStatus === 'LATE'; const classes = 'inline-flex max-w-full min-w-0 items-center gap-1 whitespace-normal break-words rounded-full px-2 py-1 text-left text-caption font-bold leading-tight [overflow-wrap:anywhere] [&_svg]:shrink-0'; if (review) return <Badge variant="warning" className={classes}><AlertCircle className="size-3" />Perlu tinjau</Badge>; if (person.state === 'ON_LEAVE') return <Badge variant="info" className={classes}>Cuti/Izin</Badge>; if (person.state === 'NOT_ATTENDED') return <Badge className={classes}><UserX className="size-3" />Belum hadir</Badge>; if (late) return <Badge variant="danger" className={classes}><Clock3 className="size-3" />Terlambat</Badge>; return <Badge variant="success" className={classes}><CheckCircle2 className="size-3" />Hadir</Badge>; }
