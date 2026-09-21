'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Download, FileSpreadsheet, FileText, MapPinned, UsersRound } from 'lucide-react';
import { apiFetch, ApiError, downloadFile } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useSession } from '@/components/providers/SessionProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { DistributionRow, MetricCard } from '@/components/ui/metrics';
import { ContextBand, DossierPage, MetricStrip } from '@/components/ui/dossier';
import { Skeleton } from '@/components/ui/skeleton';

interface Option { id: string; name: string }
interface EmployeeResponse { data: Option[] }
interface Summary { date: string; attendance: { hadir: number; terlambat: number; tidakHadir: number; perluDitinjau: number }; activePlacements: number }
interface Workforce { id: string; employmentType: string; status: string }

const REPORTS = [
  { key: 'attendance', label: 'Rekap Absensi & Keterlambatan', description: 'Presensi, keterlambatan, dan status validasi dalam rentang tanggal.', icon: CalendarDays },
  { key: 'placements', label: 'Riwayat Penempatan', description: 'Data penempatan yang tersedia sesuai cakupan akses.', icon: MapPinned },
  { key: 'leave-requests', label: 'Rekap Cuti & Izin', description: 'Pengajuan cuti dan izin berdasarkan tanggal serta status.', icon: UsersRound },
] as const;

export default function ReportsPage() {
  const { session } = useSession();
  const [employees, setEmployees] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [workforce, setWorkforce] = useState<Workforce[]>([]);
  const [loading, setLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [filters, setFilters] = useState({ from: '', to: '', employeeId: '', locationId: '', status: '' });
  const canSeeManpower = ['ADMIN_HR', 'SYSTEM_ADMIN', 'DIREKTUR', 'KOMISARIS'].includes(session.role);

  async function load() {
    setLoading(true); setOverviewError(false);
    const options = Promise.all([apiFetch<EmployeeResponse>('/employees?pageSize=100').then((response) => response.data).catch(() => []), apiFetch<Option[]>('/locations').catch(() => [])]);
    const overview = Promise.all([apiFetch<Summary>('/dashboard/summary'), canSeeManpower ? apiFetch<Workforce[]>('/employees/manpower') : Promise.resolve([])]).catch(() => null);
    const [[nextEmployees, nextLocations], overviewResult] = await Promise.all([options, overview]);
    setEmployees(nextEmployees); setLocations(nextLocations);
    if (overviewResult) { setSummary(overviewResult[0]); setWorkforce(overviewResult[1]); } else { setOverviewError(true); }
    setLoading(false);
  }
  useEffect(() => { void load(); }, [session.role]);

  async function download(reportKey: string, format: 'xlsx' | 'pdf') {
    setError(null); setDownloading(`${reportKey}-${format}`);
    try { const params = new URLSearchParams({ format }); if (filters.from) params.set('from', filters.from); if (filters.to) params.set('to', filters.to); if (filters.employeeId) params.set('employeeId', filters.employeeId); if (filters.locationId) params.set('locationId', filters.locationId); if (filters.status) params.set('status', filters.status); await downloadFile(`/reports/${reportKey}?${params.toString()}`, null, `${reportKey}.${format}`); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Gagal mengunduh laporan'); }
    finally { setDownloading(null); }
  }

  const active = workforce.filter((item) => item.status === 'ACTIVE');
  const workforceTypes = [
    { label: 'Tenaga Arsiparis', value: active.filter((item) => item.employmentType === 'TENAGA_ARSIPARIS').length },
    { label: 'Tenaga Borongan', value: active.filter((item) => item.employmentType === 'TENAGA_BORONGAN').length },
    { label: 'Staff Kantor', value: active.filter((item) => item.employmentType === 'STAFF_OFFICE').length },
  ];

  return <DossierPage className="space-y-5">
    <ContextBand className="mb-0 border border-border bg-paper px-4 py-4 text-foreground shadow-none sm:px-5 [&_h1]:text-brand [&_.text-white\/70]:text-muted [&_.text-white\/72]:text-muted" title="Laporan & Export" description="Susun dan unduh data operasional sesuai kewenangan Anda." meta={<span>MONITORING · READ & EXPORT</span>} />
    {error && <Alert variant="danger" title="Unduhan gagal">{error}</Alert>}
    {overviewError && <Alert variant="warning" title="Ringkasan saat ini tidak tersedia"><div className="flex flex-wrap items-center gap-3"><span>Filter dan export tetap dapat digunakan.</span><button type="button" onClick={() => void load()} className="font-semibold underline">Muat ulang ringkasan</button></div></Alert>}
    {loading ? <OverviewSkeleton /> : summary && <section><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold text-muted">KONTEKS DATA</p><h2 className="mt-1 text-xl font-bold text-navy">Ringkasan Hari Ini</h2></div><p className="text-xs text-slate-500">Data per {formatDate(summary.date)}, bukan tren historis</p></div><MetricStrip className="border border-border shadow-none"><MetricCard label="Hadir" value={summary.attendance.hadir} tone="success" /><MetricCard label="Terlambat" value={summary.attendance.terlambat} tone="warning" /><MetricCard label="Perlu Ditinjau" value={summary.attendance.perluDitinjau} tone="danger" /><MetricCard label="Penempatan Aktif" value={summary.activePlacements} /></MetricStrip></section>}
    {canSeeManpower && !loading && active.length > 0 && <Card className="shadow-none"><CardHeader><CardTitle>Komposisi Karyawan Aktif</CardTitle><p className="mt-1 text-sm text-slate-500">Distribusi saat ini dari data manpower, bukan perubahan antarperiode.</p></CardHeader><CardContent className="grid gap-4 lg:grid-cols-3">{workforceTypes.map((item) => <DistributionRow key={item.label} label={item.label} value={item.value} total={active.length} />)}</CardContent></Card>}
    <Card className="shadow-none"><CardHeader><CardTitle>Filter Export</CardTitle><p className="mt-1 text-body text-muted">Filter yang relevan akan diterapkan oleh masing-masing laporan.</p></CardHeader><CardContent><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><FilterDate label="Dari tanggal" value={filters.from} onChange={(value) => setFilters({ ...filters, from: value })} /><FilterDate label="Sampai tanggal" value={filters.to} onChange={(value) => setFilters({ ...filters, to: value })} /><FilterSelect label="Karyawan" value={filters.employeeId} onChange={(value) => setFilters({ ...filters, employeeId: value })} placeholder="Semua karyawan" options={employees} /><FilterSelect label="Lokasi" value={filters.locationId} onChange={(value) => setFilters({ ...filters, locationId: value })} placeholder="Semua lokasi" options={locations} /><label className="text-sm font-semibold text-foreground">Status cuti & izin<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="input mt-1 w-full"><option value="">Semua status</option><option value="PENDING">Menunggu Review</option><option value="PENDING_COORDINATOR">Menunggu Koordinator</option><option value="PENDING_HR">Menunggu HR</option><option value="PENDING_DIRECTOR">Menunggu Direktur</option><option value="APPROVED">Disetujui</option><option value="REJECTED">Ditolak</option><option value="CANCELLED">Dibatalkan</option></select></label></div></CardContent></Card>
    <section><div className="mb-3"><p className="text-xs font-semibold text-muted">FORMAT TERSEDIA</p><h2 className="mt-1 text-xl font-bold text-navy">Pilih Laporan</h2></div><div className="grid gap-3 lg:grid-cols-3">{REPORTS.map((report) => { const Icon = report.icon; return <Card key={report.key} className="overflow-hidden shadow-none"><CardContent className="flex h-full flex-col p-4"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-subtle text-brand"><Icon className="size-5" /></span><div><h3 className="font-semibold text-navy">{report.label}</h3><p className="mt-1 text-sm leading-relaxed text-slate-500">{report.description}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4"><Button disabled={downloading === `${report.key}-xlsx`} onClick={() => download(report.key, 'xlsx')}><FileSpreadsheet className="size-4" />{downloading === `${report.key}-xlsx` ? 'Mengunduh...' : 'Excel'}</Button><Button variant="secondary" disabled={downloading === `${report.key}-pdf`} onClick={() => download(report.key, 'pdf')}><FileText className="size-4" />{downloading === `${report.key}-pdf` ? 'Mengunduh...' : 'PDF'}</Button></div></CardContent></Card>; })}</div></section>
    {session.role === 'ADMIN_HR' && <Alert title="Export data besar"><span className="inline-flex items-center gap-2"><Download className="size-4" />Gunakan rentang tanggal dan filter untuk membuat file lebih terarah.</span></Alert>}
  </DossierPage>;
}

function FilterDate({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm font-semibold text-foreground">{label}<input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="input mt-1 w-full" /></label>; }
function FilterSelect({ label, value, onChange, placeholder, options }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; options: Option[] }) { return <label className="text-sm font-semibold text-foreground">{label} <span className="font-normal text-muted">(opsional)</span><select value={value} onChange={(event) => onChange(event.target.value)} className="input mt-1 w-full"><option value="">{placeholder}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>; }
function OverviewSkeleton() { return <div className="space-y-3"><Skeleton className="h-7 w-56" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-24 rounded-2xl" />)}</div></div>; }
