'use client';

import Link from 'next/link';
import { AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ChevronRight, Clock3, Fingerprint, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useSession } from '@/components/providers/SessionProvider';
import { StatusBadge } from '@/components/ui/badge';
import { ContextBand, DossierPage, WorkSheet } from '@/components/ui/dossier';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';

interface Attention { key: string; label: string; count: number; href: string }
interface WorkflowItem { id: string; status: string; employee?: { id?: string; name: string }; type?: string; date?: string; startDate?: string; requestedAt?: string }
interface AttendanceItem { id: string; date: string; checkInAt?: string | null; checkOutAt?: string | null; validationStatus: string }
interface AttendanceReviewAudit { id: string; action: string; actorRole: string; entityId: string; reason: string | null; createdAt: string; actor: { name: string | null; email: string } | null }
type CompletedItem = WorkflowItem & { source: 'leave' | 'overtime' };

export default function ActivityPage() {
  const { session } = useSession();
  if (['KARYAWAN', 'MARKETING'].includes(session.role)) return <PersonalActivity />;
  if (['KOORDINATOR', 'ADMIN_HR'].includes(session.role)) return <ManagementActivity />;
  return <><RoleActivity /><AttendanceReviewAuditPanel /></>;
}

function PersonalActivity() {
  const { session } = useSession();
  const [attendance, setAttendance] = useState<AttendanceItem[]>([]);
  const [requests, setRequests] = useState<CompletedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true); setError(false);
    try {
      const [history, leaves, overtime] = await Promise.all([
        apiFetch<AttendanceItem[]>('/attendance/me/history'),
        apiFetch<WorkflowItem[]>('/leave-requests'),
        session.role === 'KARYAWAN' ? apiFetch<WorkflowItem[]>('/overtime-requests') : Promise.resolve([]),
      ]);
      setAttendance(history.slice(0, 10));
      setRequests(sortCompleted([
        ...leaves.map((item) => ({ ...item, source: 'leave' as const })),
        ...overtime.map((item) => ({ ...item, source: 'overtime' as const })),
      ]).slice(0, 10));
    } catch (reason) { setError(reason instanceof ApiError || reason instanceof Error); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [session.role]);
  if (!session.employee) return <EmptyState title="Aktivitas pribadi tidak tersedia" description="Akun ini belum terhubung ke data karyawan." />;
  if (loading) return <ActivitySkeleton />;
  if (error) return <ErrorState retry={load} />;

  return <DossierPage className="max-w-6xl">
    <PageHeading description="Riwayat presensi dan pengajuan Anda dari data operasional saat ini." />
    <section className="mt-6" aria-labelledby="personal-title"><SectionHeading id="personal-title" eyebrow="PRIBADI" title="Aktivitas Saya" />
      <div className="grid gap-5 lg:grid-cols-2">
        <ActivityPanel title="Presensi Terbaru" href="/attendance/history?view=mine">
          {attendance.map((item) => <ActivityRow key={item.id} icon={<Fingerprint className="size-5" />} title={formatDate(item.date)} detail={item.checkInAt ? `${new Date(item.checkInAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} - ${item.checkOutAt ? new Date(item.checkOutAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'belum check-out'}` : 'Belum check-in'} status={item.validationStatus} />)}
          {!attendance.length && <EmptyState title="Belum ada riwayat presensi" />}
        </ActivityPanel>
        <ActivityPanel title="Pengajuan Saya" href="/leave-requests?view=mine">
          {requests.map((item) => <WorkflowRow key={`${item.source}-${item.id}`} item={item} personal />)}
          {!requests.length && <EmptyState title="Belum ada pengajuan" />}
        </ActivityPanel>
      </div>
    </section>
  </DossierPage>;
}

function ManagementActivity() {
  const { session } = useSession();
  const [attention, setAttention] = useState<Attention[]>([]);
  const [attendance, setAttendance] = useState<AttendanceItem[]>([]);
  const [completed, setCompleted] = useState<CompletedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true); setError(false);
    try {
      const [cards, leaves, overtime, history] = await Promise.all([
        apiFetch<Attention[]>('/dashboard/attention'),
        apiFetch<WorkflowItem[]>('/leave-requests'),
        apiFetch<WorkflowItem[]>('/overtime-requests'),
        session.employee ? apiFetch<AttendanceItem[]>('/attendance/me/history') : Promise.resolve([]),
      ]);
      setAttention(cards.filter((item) => item.count > 0));
      setAttendance(history.slice(0, 5));
      setCompleted(sortCompleted([
        ...leaves.map((item) => ({ ...item, source: 'leave' as const })),
        ...overtime.map((item) => ({ ...item, source: 'overtime' as const })),
      ]).slice(0, 30));
    } catch (reason) { setError(reason instanceof ApiError || reason instanceof Error); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [session.employee?.id]);
  if (loading) return <ActivitySkeleton />;
  if (error) return <ErrorState retry={load} />;
  const own = completed.filter((item) => item.employee?.id === session.employee?.id);
  const authority = completed.filter((item) => item.employee?.id !== session.employee?.id && isCompleted(item));
  const authorityLabel = session.role === 'KOORDINATOR' ? 'TIM' : 'ORGANISASI';

  return <DossierPage className="max-w-6xl">
    <PageHeading description="Data pribadi dipisahkan dari antrean dan hasil workflow dalam kewenangan Anda." />
    <section className="mt-6" aria-labelledby="personal-title"><SectionHeading id="personal-title" eyebrow="PRIBADI" title="Aktivitas Saya" />
      {!session.employee ? <EmptyState title="Layanan pribadi tidak tersedia" description="Akun ini belum terhubung ke data karyawan." /> : <div className="grid gap-5 lg:grid-cols-2">
        <ActivityPanel title="Presensi Saya" href="/attendance/history?view=mine">{attendance.map((item) => <ActivityRow key={item.id} icon={<Fingerprint className="size-5" />} title={formatDate(item.date)} detail={item.checkOutAt ? 'Check-in dan check-out tercatat' : 'Presensi belum lengkap'} status={item.validationStatus} />)}{!attendance.length && <EmptyState title="Belum ada riwayat presensi" />}</ActivityPanel>
        <ActivityPanel title="Pengajuan Saya" href="/leave-requests?view=mine">{own.map((item) => <WorkflowRow key={`${item.source}-${item.id}`} item={item} personal />)}{!own.length && <EmptyState title="Belum ada pengajuan" />}</ActivityPanel>
      </div>}
    </section>
    <section className="mt-8 border-t pt-7" aria-labelledby="authority-title"><SectionHeading id="authority-title" eyebrow={authorityLabel} title={session.role === 'KOORDINATOR' ? 'Aktivitas Tim' : 'Aktivitas Organisasi'} />
      <div className="grid gap-5 lg:grid-cols-2">
        <ActivityPanel title="Perlu Tindakan">{attention.map((item) => <Link key={item.key} href={item.href} className="flex min-h-20 items-center gap-3 border-b border-border p-4 last:border-0"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning-surface text-warning"><AlertTriangle className="size-5" /></span><span className="min-w-0 flex-1"><span className="block font-semibold text-brand">{item.label}</span><span className="text-body tabular-nums text-muted">{item.count} item dalam antrean</span></span><ChevronRight className="size-5 text-muted" /></Link>)}{!attention.length && <EmptyState title="Tidak ada antrean tindakan" />}</ActivityPanel>
        <ActivityPanel title="Workflow Selesai">{authority.slice(0, 12).map((item) => <WorkflowRow key={`${item.source}-${item.id}`} item={item} />)}{!authority.length && <EmptyState title="Belum ada workflow selesai" />}</ActivityPanel>
      </div>
    </section>
  </DossierPage>;
}

function RoleActivity() {
  const { session } = useSession();
  const [attention, setAttention] = useState<Attention[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  async function load() { setLoading(true); setError(false); try { setAttention(['KEUANGAN', 'DIREKTUR'].includes(session.role) ? (await apiFetch<Attention[]>('/dashboard/attention')).filter((item) => item.count > 0) : []); } catch (reason) { setError(reason instanceof ApiError || reason instanceof Error); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [session.role]);
  if (loading) return <ActivitySkeleton />;
  if (error) return <ErrorState retry={load} />;
  if (session.role === 'SYSTEM_ADMIN') return <RoleHub eyebrow="SYSTEM" description="Tidak ada penyimpanan notifikasi terpisah. Gunakan pusat administrasi dan monitoring yang berwenang." links={[['Administrasi Sistem', '/system', <Settings key="system" className="size-5" />], ['Monitoring & Laporan', '/reports', <BarChart3 key="reports" className="size-5" />]]} />;
  if (session.role === 'KOMISARIS') return <RoleHub eyebrow="READ-ONLY" description="Tidak ada antrean tindakan untuk Komisaris." links={[["Buka laporan monitoring", '/reports', <BarChart3 key="reports" className="size-5" />]]} />;
  return <DossierPage className="max-w-6xl"><PageHeading description="Antrean workflow nyata yang tersedia untuk kewenangan peran Anda." /><WorkSheet title="Perlu Tindakan" className="mt-6"><div className="divide-y divide-border">{attention.map((item) => <Link key={item.key} href={session.role === 'DIREKTUR' ? '/approvals' : item.href} className="flex min-h-16 min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0"><AlertTriangle className="size-4 shrink-0 text-warning" /><span className="min-w-0 flex-1 break-words font-semibold text-navy [overflow-wrap:anywhere]">{item.label}<span className="block text-sm font-normal text-slate-500">{item.count} item dalam antrean</span></span><ChevronRight className="size-4 shrink-0 text-muted" /></Link>)}{!attention.length && <EmptyState title="Tidak ada antrean" description="Semua tindakan telah tertangani." />}</div></WorkSheet></DossierPage>;
}

function AttendanceReviewAuditPanel() {
  const { session } = useSession();
  const allowed = ['DIREKTUR', 'KOMISARIS', 'SYSTEM_ADMIN'].includes(session.role);
  const [rows, setRows] = useState<AttendanceReviewAudit[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => { if (allowed) void apiFetch<AttendanceReviewAudit[]>('/attendance/review-audit').then(setRows).catch(() => setFailed(true)); }, [allowed]);
  if (!allowed) return null;
  return <section className="mx-auto mt-6 max-w-6xl"><WorkSheet title="Riwayat Review Presensi" description="AUDIT READ-ONLY">{failed ? <p className="text-body text-danger" role="alert">Riwayat audit tidak dapat dimuat.</p> : <div className="divide-y divide-border">{rows.map((row) => <div key={row.id} className="flex min-w-0 flex-col gap-2 py-3 text-sm first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="font-semibold text-brand">{row.action === 'ATTENDANCE_SELF_REVIEW' ? 'Review mandiri Admin HR' : 'Review presensi'}</p><p className="break-words text-caption text-muted [overflow-wrap:anywhere]">{row.actor?.name ?? row.actor?.email ?? row.actorRole} · {row.reason ?? 'Tanpa catatan'}</p></div><time className="shrink-0 text-caption tabular-nums text-muted">{formatDate(row.createdAt)}</time></div>)}{!rows.length && <EmptyState title="Belum ada audit review presensi" />}</div>}</WorkSheet></section>;
}

function PageHeading({ description }: { description: string }) { return <ContextBand title="Pusat Aktivitas" description={description} meta={<span>PUSAT AKTIVITAS</span>} />; }
function SectionHeading({ id, eyebrow, title }: { id?: string; eyebrow: string; title: string }) { return <div className="mb-3"><p className="text-caption font-bold uppercase tracking-[0.12em] text-brand">{eyebrow}</p><h2 id={id} className="mt-1 text-section-title text-brand">{title}</h2></div>; }
function ActivityPanel({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) { return <WorkSheet title={title} actions={href && <Link href={href} className="text-xs font-semibold text-brand">Lihat semua</Link>}><div className="divide-y divide-border">{children}</div></WorkSheet>; }
function ActivityRow({ icon, title, detail, status }: { icon: React.ReactNode; title: string; detail: string; status: string }) { return <div className="flex min-w-0 min-h-16 items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">{icon}</span><span className="min-w-0 flex-1"><span className="block break-words font-semibold text-navy [overflow-wrap:anywhere]">{title}</span><span className="block break-words text-xs text-slate-500 [overflow-wrap:anywhere]">{detail}</span></span><StatusBadge status={status} className="shrink-0" /></div>; }
function WorkflowRow({ item, personal = false }: { item: CompletedItem; personal?: boolean }) { return <ActivityRow icon={item.source === 'overtime' ? <Clock3 className="size-5" /> : item.status === 'APPROVED' ? <CheckCircle2 className="size-5" /> : <CalendarDays className="size-5" />} title={personal ? (item.source === 'overtime' ? 'Lembur saya' : `Pengajuan ${item.type ?? 'cuti/izin'}`) : item.employee?.name ?? 'Karyawan'} detail={`${item.source === 'overtime' ? 'Lembur' : item.type ?? 'Cuti/Izin'} · ${formatDate(item.date ?? item.startDate ?? item.requestedAt)}`} status={item.status} />; }
function RoleHub({ eyebrow, description, links }: { eyebrow: string; description: string; links: [string, string, React.ReactNode][] }) { return <DossierPage className="max-w-6xl"><PageHeading description={description} /><WorkSheet title="Ruang Kerja" description={eyebrow}><div className="divide-y divide-border">{links.map(([label, href, icon]) => <Link key={href} href={href} className="flex min-h-16 min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="shrink-0 text-brand">{icon}</span><span className="min-w-0 flex-1 break-words font-semibold text-navy [overflow-wrap:anywhere]">{label}</span><ChevronRight className="size-4 shrink-0 text-muted" /></Link>)}</div></WorkSheet></DossierPage>; }
function ActivitySkeleton() { return <div className="space-y-4"><Skeleton className="h-20 rounded-2xl" /><div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div></div>; }
function isCompleted(item: WorkflowItem) { return ['APPROVED', 'REJECTED', 'CANCELLED'].includes(item.status); }
function sortCompleted(items: CompletedItem[]) { return items.sort((a, b) => new Date(b.requestedAt ?? b.date ?? b.startDate ?? 0).getTime() - new Date(a.requestedAt ?? a.date ?? a.startDate ?? 0).getTime()); }
