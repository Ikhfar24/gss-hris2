"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  Fingerprint,
  MapPin,
  Settings,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import type { ApprovedFullDayAbsence, AttendanceMode, AttendanceRecord } from "@/lib/attendance";
import { approvedAbsenceLabel, attendanceStatus } from "@/lib/attendance";
import { formatFullDate, formatTime, formatDate } from "@/lib/format";
import { canAttend } from "@/lib/navigation";
import { useSession } from "@/components/providers/SessionProvider";
import { CurrentUserAvatar } from "@/components/employee/CurrentUserIdentity";
import { MobileIdentityHeader } from "@/components/employee/MobileIdentityHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextBand,
  DossierPage,
  WorkSheet,
} from "@/components/ui/dossier";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";

interface Attention {
  key: string;
  label: string;
  count: number;
  href: string;
}
interface Summary {
  attendance: {
    hadir: number;
    terlambat: number;
    tidakHadir: number;
    perluDitinjau: number;
  };
  pendingLeaveRequests: number;
  pendingPlacementRequests: number;
  activePlacements: number;
}
interface Today {
  attendance: AttendanceRecord | null;
  attendanceMode: AttendanceMode;
  expectedLocation: { name: string };
  approvedAbsence: ApprovedFullDayAbsence | null;
}
interface Run {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  _count: { slips: number };
}
interface Revision {
  id: string;
  status: string;
}
interface Workforce {
  id: string;
  employmentType: string;
  status: string;
}

export function FinanceHome() {
  const { session } = useSession();
  const [today, setToday] = useState<Today | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [attention, setAttention] = useState<Attention[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  async function load() {
    setLoading(true);
    setError(false);
    try {
      const [nextToday, nextRuns, nextRevisions, nextAttention] =
        await Promise.all([
          canAttend(session)
            ? apiFetch<Today>("/attendance/me/today").catch(() => null)
            : Promise.resolve(null),
          apiFetch<Run[]>("/payroll/runs"),
          apiFetch<Revision[]>("/payroll-admin/revisions"),
          apiFetch<Attention[]>("/dashboard/attention"),
        ]);
      setToday(nextToday);
      setRuns(nextRuns);
      setRevisions(nextRevisions);
      setAttention(nextAttention);
    } catch (reason) {
      setError(reason instanceof ApiError || reason instanceof Error);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    window.addEventListener("attendance-updated", load);
    return () => window.removeEventListener("attendance-updated", load);
  }, []);
  if (loading) return <HomeSkeleton />;
  if (error) return <ErrorState retry={load} />;
  const activeRun = runs.find((run) => run.status !== "FINALIZED") ?? runs[0];
  const pending = attention.filter((item) => item.count > 0);
  return (
    <DossierPage className="space-y-4">
      <MobileIdentityHeader className="sm:hidden" />
      <div className="hidden sm:block"><IdentityZone eyebrow="KEUANGAN · PRIBADI & PAYROLL" /></div>
      <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <PersonalAttendance today={today} />
        <WorkSheet
          title="Payroll Terkini"
          description="Periode payroll yang sedang menjadi fokus."
          actions={<WalletCards className="size-5 text-brand" />}
        >
          {activeRun ? (
            <div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-body text-muted">
                    {formatDate(activeRun.periodStart)} -{" "}
                    {formatDate(activeRun.periodEnd)}
                  </p>
                  <p className="mt-2 text-xl font-bold text-brand">
                    {statusText(activeRun.status)}
                  </p>
                  <p className="mt-1 text-body tabular-nums text-muted">
                    {activeRun._count.slips} slip karyawan
                  </p>
                </div>
                <Badge
                  variant={
                    activeRun.status === "FINALIZED" ? "success" : "warning"
                  }
                >
                  {statusText(activeRun.status)}
                </Badge>
              </div>
              <Button asChild className="mt-5 w-full sm:w-auto">
                <Link href="/payroll">
                  Buka Payroll <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <EmptyState
              title="Belum ada payroll"
              description="Buat payroll dari periode yang sudah tersedia."
            />
          )}
        </WorkSheet>
      </div>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <WorkSheet
          title="Perlu Tindakan"
          description="Hanya antrean Finance dari lifecycle payroll yang aktif."
        >
          {pending.length ? (
            <div className="divide-y divide-border">
              {pending.map((item) => (
                <ActionCard key={item.key} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Tidak ada antrean Finance"
              description="Semua tindakan payroll telah tertangani."
            />
          )}
        </WorkSheet>
        <section>
          <h2 className="mb-3 text-section-title text-brand">Ringkasan Payroll</h2>
          <div className="grid grid-cols-2 gap-3">
          <Metric label="Total Periode" value={runs.length} />
          <Metric
            label="Draft"
            value={runs.filter((run) => run.status === "DRAFT").length}
          />
          <Metric
            label="Menunggu Direktur"
            value={
              runs.filter((run) => run.status === "PENDING_DIRECTOR_APPROVAL")
                .length
            }
          />
          <Metric
            label="Revisi Aktif"
            value={
              revisions.filter(
                (revision) =>
                  !["FINALIZED", "REJECTED", "CANCELLED"].includes(
                    revision.status,
                  ),
              ).length
            }
          />
          </div>
        </section>
      </div>
    </DossierPage>
  );
}

export function ExecutiveHome({ role }: { role: "DIREKTUR" | "KOMISARIS" }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [workforce, setWorkforce] = useState<Workforce[]>([]);
  const [attention, setAttention] = useState<Attention[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  async function load() {
    setLoading(true);
    setError(false);
    try {
      const [nextSummary, nextWorkforce, nextAttention] = await Promise.all([
        apiFetch<Summary>("/dashboard/summary"),
        apiFetch<Workforce[]>("/employees/manpower"),
        role === "DIREKTUR"
          ? apiFetch<Attention[]>("/dashboard/attention")
          : Promise.resolve([]),
      ]);
      setSummary(nextSummary);
      setWorkforce(nextWorkforce);
      setAttention(nextAttention);
    } catch (reason) {
      setError(reason instanceof ApiError || reason instanceof Error);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [role]);
  if (loading) return <HomeSkeleton />;
  if (error || !summary) return <ErrorState retry={load} />;
  const active = workforce.filter((item) => item.status === "ACTIVE");
  const arsiparis = active.filter(
    (item) => item.employmentType === "TENAGA_ARSIPARIS",
  ).length;
  const borongan = active.filter(
    (item) => item.employmentType === "TENAGA_BORONGAN",
  ).length;
  const staffOffice = active.filter(
    (item) => item.employmentType === "STAFF_OFFICE",
  ).length;
  const queue = attention.filter((item) => item.count > 0);
  return (
    <DossierPage className="space-y-4">
      <MobileIdentityHeader className="sm:hidden" />
      <div className="hidden sm:block"><IdentityZone
        eyebrow={
          role === "DIREKTUR"
            ? "DIREKTUR · EXECUTIVE OVERVIEW"
            : "KOMISARIS · READ-ONLY OVERVIEW"
        }
      /></div>
      <section>
        <div className="mb-3">
          <h2 className="text-section-title text-brand">Ringkasan Hari Ini</h2>
          <p className="mt-1 text-body text-muted">
            {role === "KOMISARIS"
              ? "Monitoring agregat tanpa tindakan operasional."
              : "Kondisi workforce dan sinyal operasional untuk pengambilan keputusan."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Karyawan Aktif" value={active.length} />
          <Metric label="Penempatan Aktif" value={summary.activePlacements} />
          <Metric
            label="Hadir"
            value={summary.attendance.hadir}
            tone="success"
          />
          <Metric
            label="Perlu Review HR"
            value={summary.attendance.perluDitinjau}
            tone="warning"
          />
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <WorkSheet title="Komposisi Tenaga Kerja" className="h-full">
          <div className="space-y-5">
            <Composition
              label="Tenaga Arsiparis"
              value={arsiparis}
              total={active.length}
            />
            <Composition
              label="Tenaga Borongan"
              value={borongan}
              total={active.length}
            />
            <Composition
              label="Staff Kantor"
              value={staffOffice}
              total={active.length}
            />
          </div>
        </WorkSheet>
        <WorkSheet title="Kondisi Presensi" className="h-full">
          <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-lg bg-surface-subtle">
            <SmallMetric
              label="Terlambat"
              value={summary.attendance.terlambat}
            />
            <SmallMetric
              label="Belum Absen"
              value={summary.attendance.tidakHadir}
            />
            <SmallMetric
              label="Perlu Ditinjau"
              value={summary.attendance.perluDitinjau}
            />
          </div>
        </WorkSheet>
      </div>
      {role === "DIREKTUR" ? (
        <WorkSheet
          title="Keputusan Menunggu"
          description="Hanya tahap yang secara eksplisit menjadi kewenangan Direktur."
        >
          {queue.length ? (
            <div className="divide-y divide-border">
              {queue.map((item) => (
                <ActionCard
                  key={item.key}
                  item={{ ...item, href: "/approvals" }}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Tidak ada keputusan tertunda"
              description="Semua tahap Direktur sudah tertangani."
            />
          )}
        </WorkSheet>
      ) : (
        <WorkSheet>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-brand">
                Akses monitoring read-only
              </p>
              <p className="mt-1 text-body text-muted">
                Laporan menggunakan data backend yang sudah diotorisasi tanpa
                kontrol mutasi.
              </p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/reports">
                <BarChart3 className="size-4" />
                Buka Monitoring
              </Link>
            </Button>
          </div>
        </WorkSheet>
      )}
    </DossierPage>
  );
}

export function SystemAdminHome() {
  return (
    <DossierPage className="space-y-4">
      <MobileIdentityHeader className="sm:hidden" />
      <div className="hidden sm:block"><IdentityZone eyebrow="SYSTEM ADMIN · SYSTEM AUTHORITY" /></div>
      <WorkSheet
        title="Administrasi Utama"
        description="Modul yang sudah tersedia dan dilindungi backend."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {systemModules.slice(0, 4).map((module) => (
            <ModuleCard key={module.href} {...module} />
          ))}
        </div>
      </WorkSheet>
      <WorkSheet title="Operasional & Akses" description="Master data dan konfigurasi operasional.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {systemModules.slice(4).map((module) => (
            <ModuleCard key={module.href} {...module} />
          ))}
        </div>
      </WorkSheet>
      <div className="flex flex-col gap-3 rounded-xl bg-brand px-5 py-4 text-white shadow-sheet sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">Administrasi sistem terpisah dari proses bisnis</p>
          <p className="mt-1 max-w-3xl text-body text-white/70">
            Kelola akses dan konfigurasi tanpa mengambil alih kewenangan workflow bisnis.
          </p>
        </div>
        <Button asChild variant="secondary" className="w-full shrink-0 sm:w-auto">
          <Link href="/system">
            Buka Hub Sistem <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </DossierPage>
  );
}

export const systemModules = [
  {
    title: "Manajemen User",
    description: "Akun, role, tautan Employee, dan lifecycle aman.",
    href: "/users",
    icon: UserRoundCog,
  },
  {
    title: "Company Settings",
    description: "Branding dan identitas aplikasi terproteksi.",
    href: "/settings",
    icon: Settings,
  },
  {
    title: "Coordinator Scope",
    description: "Cakupan aktif Arsiparis, Borongan, dan Staff Kantor.",
    href: "/users#coordinator-scopes",
    icon: ShieldCheck,
  },
  {
    title: "Data Karyawan",
    description: "Visibilitas sistem dan hubungan akun.",
    href: "/employees",
    icon: UsersRound,
  },
  {
    title: "Lokasi Kerja",
    description: "Lokasi, geofence, dan jadwal kerja.",
    href: "/locations",
    icon: MapPin,
  },
  {
    title: "Klien",
    description: "Master klien yang sudah tersedia.",
    href: "/clients",
    icon: Building2,
  },
  {
    title: "Kalender",
    description: "Hari libur dan kalender operasional.",
    href: "/holidays",
    icon: CalendarDays,
  },
] as const;

function IdentityZone({ eyebrow }: { eyebrow: string }) {
  const { session } = useSession();
  const employee = session.employee;
  return (
    <ContextBand
      title={employee?.name ?? session.email}
      description={employee?.jobTitle ?? session.role.replaceAll("_", " ")}
      meta={
        <>
          <span>{eyebrow}</span>
          {employee?.activePlacementName && (
            <span className="inline-flex min-w-0 items-center gap-1 break-words [overflow-wrap:anywhere]">
              <MapPin className="size-3.5 shrink-0" />
              {employee.activePlacementName}
            </span>
          )}
        </>
      }
      actions={
        <CurrentUserAvatar
          size="lg"
          className="size-20 border-white/20"
        />
      }
      className="mb-0 py-4"
    />
  );
}
function PersonalAttendance({ today }: { today: Today | null }) {
  const { session } = useSession();
  const enabled = canAttend(session);
  const record = today?.attendance;
  const approvedAbsence = today?.approvedAbsence;
  return (
    <WorkSheet
      title="Presensi Saya"
      description={
        formatFullDate(record?.date ?? new Date())
      }
      actions={
        today && (
          <Badge
            variant={today.attendanceMode === "MOBILE" ? "info" : "neutral"}
          >
            {today.attendanceMode === "MOBILE" ? "Mobile" : "Geofence"}
          </Badge>
        )
      }
    >
      <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-lg bg-surface-subtle">
        <SmallMetric label="Check-in" text={formatTime(record?.checkInAt)} />
        <SmallMetric label="Check-out" text={formatTime(record?.checkOutAt)} />
      </div>
      <p className="mt-4 text-body font-semibold text-brand">
        {!enabled
          ? "Presensi tidak tersedia"
          : approvedAbsence
            ? `${approvedAbsenceLabel(approvedAbsence.type)} disetujui`
            : record
            ? attendanceStatus(record)
            : "Belum presensi"}
      </p>
      {enabled && !approvedAbsence && (
        <Button asChild className="mt-4 w-full">
          <Link href="/attendance">
            <Fingerprint className="size-4" />
            Buka Presensi
          </Link>
        </Button>
      )}
    </WorkSheet>
  );
}
function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div className="min-w-0 rounded-xl bg-paper px-4 py-4 shadow-sheet">
      <p className="text-caption font-semibold text-muted">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-bold tabular-nums ${tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-brand"}`}
      >
        {value}
      </p>
      <div className={`mt-3 h-1 w-8 rounded-full ${tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-accent"}`} />
    </div>
  );
}
function SmallMetric({
  label,
  value,
  text,
}: {
  label: string;
  value?: number;
  text?: string;
}) {
  return (
    <div className="min-w-0 px-3 py-4">
      <p className="text-caption text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-brand">
        {text ?? value ?? 0}
      </p>
    </div>
  );
}
function ActionCard({ item }: { item: Attention }) {
  return (
    <Link
      href={item.href}
      className="group flex min-h-14 min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning-surface text-warning">
        <AlertTriangle className="size-5" />
      </span>
      <span className="min-w-0 flex-1 break-words text-body font-semibold text-brand [overflow-wrap:anywhere]">{item.label}</span>
      <span className="rounded-full bg-warning-surface px-2.5 py-1 text-sm font-bold tabular-nums text-warning-foreground">{item.count}</span>
      <ArrowRight className="size-4 shrink-0 text-muted" />
    </Link>
  );
}
function Composition({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted">
          {value} · {percent}%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
function ModuleCard({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: typeof UsersRound;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-32 min-w-0 flex-col items-start rounded-xl bg-surface-subtle p-4 transition-colors hover:bg-brand/10"
    >
      <span className="flex w-full items-start justify-between gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
          <Icon className="size-5" />
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted" />
      </span>
      <span className="mt-3 min-w-0 flex-1">
        <span className="block font-semibold text-brand">{title}</span>
        <span className="mt-1 block break-words text-caption leading-5 text-muted [overflow-wrap:anywhere]">
          {description}
        </span>
      </span>
    </Link>
  );
}
function statusText(status: string) {
  return (
    (
      {
        DRAFT: "Draft Finance",
        PENDING_DIRECTOR_APPROVAL: "Menunggu Direktur",
        FINALIZED: "Final",
        APPROVED: "Disetujui",
        REJECTED: "Ditolak",
      } as Record<string, string>
    )[status] ?? status.replaceAll("_", " ")
  );
}
function HomeSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-52 rounded-[1.75rem]" />
      <div className="grid gap-5 xl:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}
