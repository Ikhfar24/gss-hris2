"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Fingerprint,
  MapPin,
  UserX,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import type { ApprovedFullDayAbsence, AttendanceMode, AttendanceRecord } from "@/lib/attendance";
import { approvedAbsenceLabel, attendanceStatus } from "@/lib/attendance";
import { formatFullDate, formatTime } from "@/lib/format";
import { canAttend } from "@/lib/navigation";
import { useSession } from "@/components/providers/SessionProvider";
import { MobileIdentityHeader } from "@/components/employee/MobileIdentityHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DossierPage,
  WorkSheet,
} from "@/components/ui/dossier";
import { Alert, ErrorState } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";

type EmploymentType = "TENAGA_ARSIPARIS" | "TENAGA_BORONGAN" | "STAFF_OFFICE";
interface Summary {
  date: string;
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
interface Attention {
  key: string;
  label: string;
  count: number;
  href: string;
}
interface Today {
  attendance: AttendanceRecord | null;
  attendanceMode: AttendanceMode;
  expectedLocation: { name: string };
  approvedAbsence: ApprovedFullDayAbsence | null;
}
interface MonitoringDay {
  date: string;
  summary: {
    totalScheduled: number;
    attended: number;
    notAttended: number;
    onLeave: number;
    late: number;
  };
  people?: {
    employee: { id: string; name: string; jobTitle: string | null };
    location: { name: string };
    state: "CHECKED_IN" | "CHECKED_OUT" | "NOT_ATTENDED" | "ON_LEAVE";
    attendance: { checkInAt: string | null; latenessStatus: string } | null;
  }[];
}
interface PayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  _count: { slips: number };
}

const typeLabel: Record<EmploymentType, string> = {
  TENAGA_ARSIPARIS: "Arsiparis",
  TENAGA_BORONGAN: "Borongan",
  STAFF_OFFICE: "Staff Kantor",
};

export function ManagementHome({ role }: { role: "KOORDINATOR" | "ADMIN_HR" }) {
  const { session } = useSession();
  const isCoordinator = role === "KOORDINATOR";
  const availableTypes: EmploymentType[] = isCoordinator
    ? session.coordinatorScopeTypes
    : ["TENAGA_ARSIPARIS", "TENAGA_BORONGAN", "STAFF_OFFICE"];
  const [type, setType] = useState<EmploymentType | "">(
    isCoordinator && availableTypes.length === 1 ? availableTypes[0] : "",
  );
  const [summary, setSummary] = useState<Summary | null>(null);
  const [attention, setAttention] = useState<Attention[]>([]);
  const [today, setToday] = useState<Today | null>(null);
  const [activeEmployees, setActiveEmployees] = useState(0);
  const [attendanceTrend, setAttendanceTrend] = useState<MonitoringDay[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async (selectedType = type) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(false);
    const filter = selectedType ? `employmentType=${selectedType}` : "";
    try {
      const dates = Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() - (6 - index));
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      });
      const [nextSummary, nextAttention, employees, nextToday, nextTrend, nextPayrollRuns] =
        await Promise.all([
          apiFetch<Summary>(`/dashboard/summary${filter ? `?${filter}` : ""}`),
          apiFetch<Attention[]>("/dashboard/attention"),
          apiFetch<{ meta: { total: number } }>(
            `/employees?page=1&pageSize=1&status=ACTIVE${selectedType ? `&employmentType=${selectedType}` : ""}`,
          ),
          canAttend(session)
            ? apiFetch<Today>("/attendance/me/today").catch(() => null)
            : Promise.resolve(null),
          Promise.all(
            dates.map((date) =>
              apiFetch<MonitoringDay>(
                `/attendance/monitoring?date=${date}${selectedType ? `&employmentType=${selectedType}` : ""}`,
              ),
            ),
          ).catch(() => []),
          isCoordinator
            ? Promise.resolve([])
            : apiFetch<PayrollRun[]>("/payroll/runs").catch(() => []),
        ]);
      if (currentRequest !== requestId.current) return;
      setSummary(nextSummary);
      setAttention(nextAttention);
      setActiveEmployees(employees.meta.total);
      setToday(nextToday);
      setAttendanceTrend(nextTrend);
      setPayrollRuns(nextPayrollRuns);
    } catch (reason) {
      if (currentRequest === requestId.current)
        setError(reason instanceof ApiError || reason instanceof Error);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [type, session, isCoordinator]);
  useEffect(() => {
    void load();
    const refreshAttendance = () => void load();
    window.addEventListener("attendance-updated", refreshAttendance);
    return () =>
      window.removeEventListener("attendance-updated", refreshAttendance);
  }, [load]);
  if (loading && !summary) return <ManagementSkeleton />;
  if (!summary) return <ErrorState retry={load} />;

  const employee = session.employee;
  const displayName = employee?.name ?? session.email;
  const contextTitle = isCoordinator
    ? `Tim Saya${type ? ` — ${typeLabel[type]}` : availableTypes.length ? "" : " — Belum ada scope aktif"}`
    : `Workforce Hari Ini${type ? ` — ${typeLabel[type]}` : ""}`;
  const withType = (href: string) =>
    type
      ? `${href}${href.includes("?") ? "&" : "?"}employmentType=${type}`
      : href;
  const typeOptions = [
    { value: "" as const, label: "Semua" },
    ...availableTypes.map((entry) => ({
      value: entry,
      label: typeLabel[entry],
    })),
  ];

  return (
    <DossierPage className="space-y-3 sm:space-y-4">
      {error && (
        <Alert variant="danger">
          <span>
            Data terbaru gagal dimuat. Data sebelumnya tetap ditampilkan.
          </span>{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="font-semibold underline"
          >
            Coba lagi
          </button>
        </Alert>
      )}
      <MobileIdentityHeader className="sm:hidden" />
      <section aria-busy={loading}>
        <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <h1 className="hidden text-page-title text-brand sm:block">Dashboard</h1>
            <p className="mt-0.5 hidden break-words text-body text-muted sm:block [overflow-wrap:anywhere]">
              Halo, <span className="font-semibold text-foreground">{displayName}</span>. {contextTitle} dalam satu ringkasan.
            </p>
            <p className="mt-1 hidden text-caption font-semibold text-brand sm:block">
              {isCoordinator ? "Koordinator · PRIBADI & TIM" : "Admin HR · PRIBADI & Workforce"}
            </p>
            {loading && (
              <p className="mt-1 text-xs text-slate-400" role="status">
                Memperbarui data...
              </p>
            )}
          </div>
          {availableTypes.length > 1 && (
            <div className="max-w-full overflow-x-auto overscroll-x-contain pb-1 sm:max-w-[32rem]">
              <SegmentedControl
                aria-label="Filter jenis tenaga"
                value={type}
                onValueChange={setType}
                options={typeOptions}
              />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <Metric
            label="Total Karyawan"
            value={activeEmployees}
            href={withType("/employees")}
            icon={UsersRound}
          />
          <Metric
            label="Hadir Hari Ini"
            value={summary.attendance.hadir}
            href={withType("/attendance?view=team")}
            tone="success"
            icon={CheckCircle2}
          />
          <Metric
            label="Alpha/Tidak Hadir"
            value={summary.attendance.tidakHadir}
            href={withType("/attendance?view=team&state=NOT_ATTENDED")}
            tone="danger"
            icon={UserX}
          />
          <Metric
            label="Terlambat"
            value={summary.attendance.terlambat}
            href={withType("/attendance?view=team&state=LATE")}
            tone="warning"
            icon={Clock3}
          />
        </div>
      </section>
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.75fr)] lg:gap-4">
        <AttendanceTrend days={attendanceTrend} className="order-2 lg:order-1" />
        <WorkSheet
          id="actions"
          title="Perlu Tindakan"
          description="Antrean workflow dalam kewenangan Anda."
          className="order-1 h-full lg:order-2"
        >
          {attention.filter((item) => item.count > 0).length ? (
            <div className="divide-y divide-border">
              {attention
                .filter((item) => item.count > 0)
                .map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="group flex min-h-14 min-w-0 items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <AlertTriangle className="size-4 shrink-0 text-warning" />
                    <span className="min-w-0 flex-1 break-words text-body font-semibold text-brand [overflow-wrap:anywhere]">
                      {item.label}
                    </span>
                    <span className="text-xl font-bold tabular-nums text-brand">
                      {item.count}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted" />
                  </Link>
                ))}
            </div>
          ) : (
            <p className="py-5 text-body text-muted">
              Tidak ada antrean yang memerlukan tindakan saat ini.
            </p>
          )}
        </WorkSheet>
      </div>
      <div className="grid min-w-0 gap-3 md:grid-cols-2 md:gap-4">
        {isCoordinator ? (
          <TeamSnapshot people={attendanceTrend.at(-1)?.people ?? []} />
        ) : (
          <AttendanceDistribution attendance={summary.attendance} />
        )}
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
          <PlacementSnapshot count={summary.activePlacements} href={withType("/employees")} />
          {isCoordinator ? (
            <PersonalAttendance today={today} enabled={canAttend(session)} />
          ) : (
            <PayrollLifecycle runs={payrollRuns} />
          )}
        </div>
      </div>
      <WorkSheet
        title="Layanan Pribadi"
        description="Akses pribadi terpisah dari kewenangan tim dan Workforce."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Service
            href="/attendance?view=mine"
            icon={Fingerprint}
            label="Presensi Saya"
          />
          <Service
            href="/leave-requests?view=mine"
            icon={CalendarDays}
            label="Cuti & Izin Saya"
          />
          {isCoordinator && (
            <Service
              href="/overtime-requests?view=mine"
              icon={Clock3}
              label="Lembur Saya"
            />
          )}
          <Service
            href="/attendance/history?view=mine"
            icon={CalendarDays}
            label="Riwayat Saya"
          />
          {!isCoordinator && (
            <Service href="/reports" icon={Download} label="Unduh Laporan" />
          )}
        </div>
        {!isCoordinator && (
          <p className="mt-4 text-xs text-slate-500">
            Pengajuan lembur pribadi belum didukung untuk peran Admin HR.
          </p>
        )}
      </WorkSheet>
    </DossierPage>
  );
}

function PersonalAttendance({
  today,
  enabled,
}: {
  today: Today | null;
  enabled: boolean;
}) {
  const attendance = today?.attendance;
  const approvedAbsence = today?.approvedAbsence;
  return (
    <WorkSheet
      title="Presensi Saya"
      description={
        <>
          {formatFullDate(attendance?.date ?? new Date())}
        </>
      }
      actions={
        today && (
          <Badge
            variant={today.attendanceMode === "MOBILE" ? "info" : "neutral"}
            className="shrink-0 whitespace-nowrap text-xs"
          >
            {today.attendanceMode === "MOBILE" ? "Mobile" : "Geofence"}
          </Badge>
        )
      }
    >
      <div className="grid grid-cols-2 overflow-hidden rounded-lg bg-surface-subtle">
        <Time label="Check-in" value={formatTime(attendance?.checkInAt)} />
        <Time label="Check-out" value={formatTime(attendance?.checkOutAt)} />
      </div>
      <p className="mt-4 text-sm font-semibold text-navy">
        {!enabled
          ? "Presensi tidak tersedia"
          : approvedAbsence
            ? `${approvedAbsenceLabel(approvedAbsence.type)} disetujui`
            : attendance
            ? attendanceStatus(attendance)
            : "Belum presensi"}
      </p>
      {today?.expectedLocation.name && (
        <p className="mt-1 break-words text-xs text-slate-500 [overflow-wrap:anywhere]">
          {today.expectedLocation.name}
        </p>
      )}
      {enabled && !approvedAbsence && (
        <Button asChild className="mt-4 w-full">
          <Link href="/attendance?view=mine">
            <Fingerprint className="size-4" />
            Buka Presensi Saya
          </Link>
        </Button>
      )}
    </WorkSheet>
  );
}
function Time({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-4 first:border-r first:border-border">
      <p className="dossier-label">{label}</p>
      <p className="mt-1 break-words text-lg font-bold tabular-nums text-brand [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}
function AttendanceDistribution({
  attendance,
}: {
  attendance: Summary["attendance"];
}) {
  const rows = [
    { label: "Hadir", value: attendance.hadir, color: "bg-success" },
    { label: "Terlambat", value: attendance.terlambat, color: "bg-warning" },
    { label: "Belum absen", value: attendance.tidakHadir, color: "bg-slate-400" },
    { label: "Perlu review", value: attendance.perluDitinjau, color: "bg-amber-500" },
  ];
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <WorkSheet title="Kondisi Presensi" description="Perbandingan jumlah pada ringkasan hari ini.">
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between gap-3 text-caption">
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="font-semibold tabular-nums text-brand">{row.value}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background">
              <div
                className={`h-full rounded-full ${row.color}`}
                style={{ width: `${(row.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </WorkSheet>
  );
}
function AttendanceTrend({ days, className }: { days: MonitoringDay[]; className?: string }) {
  const max = Math.max(...days.map((day) => day.summary.totalScheduled), 1);
  const dayFormatter = new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    timeZone: "Asia/Jakarta",
  });
  const dateFormatter = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });
  return (
    <WorkSheet
      title="Tren Kehadiran 7 Hari"
      description="Komposisi presensi harian dalam cakupan aktif."
      className={`sm:min-h-[22rem] ${className ?? ""}`}
      actions={
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted" aria-label="Legenda grafik">
          <Legend color="bg-success-accent" label="Hadir" />
          <Legend color="bg-warning-accent" label="Terlambat" />
          <Legend color="bg-slate-400" label="Tidak hadir" />
          <Legend color="bg-indigo" label="Cuti/Izin" />
        </div>
      }
    >
      <div className="relative h-32 border-b border-l border-border pl-2 pt-2 sm:h-60 sm:pl-3">
        <div aria-hidden="true" className="absolute inset-x-0 top-1/4 border-t border-dashed border-border/70" />
        <div aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/70" />
        <div aria-hidden="true" className="absolute inset-x-0 top-3/4 border-t border-dashed border-border/70" />
        <div className="relative z-10 flex h-full items-end justify-around gap-1 sm:gap-3">
          {days.map((day) => {
            const date = new Date(`${day.date}T00:00:00+07:00`);
            const punctual = Math.max(day.summary.attended - day.summary.late, 0);
            const segments = [
              { label: "Hadir tepat waktu", value: punctual, color: "bg-success-accent" },
              { label: "Terlambat", value: day.summary.late, color: "bg-warning-accent" },
              { label: "Tidak hadir", value: day.summary.notAttended, color: "bg-slate-400" },
              { label: "Cuti atau izin", value: day.summary.onLeave, color: "bg-indigo" },
            ];
            return (
              <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                <div
                  className="flex w-full max-w-12 flex-col-reverse overflow-hidden rounded-t-sm bg-surface-subtle sm:max-w-14"
                  style={{ height: `${Math.max((day.summary.totalScheduled / max) * 100, 3)}%` }}
                  title={`${dateFormatter.format(date)}: ${day.summary.attended} hadir, ${day.summary.late} terlambat, ${day.summary.notAttended} tidak hadir, ${day.summary.onLeave} cuti/izin`}
                >
                  {segments.map((segment) => (
                    <span
                      key={segment.label}
                      className={segment.color}
                      style={{ height: `${day.summary.totalScheduled ? (segment.value / day.summary.totalScheduled) * 100 : 0}%` }}
                    />
                  ))}
                </div>
                <span className="mt-2 text-[0.65rem] font-semibold text-foreground sm:text-caption">
                  {dayFormatter.format(date)}
                </span>
                <span className="hidden text-[0.65rem] text-muted sm:block">{dateFormatter.format(date)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {!days.length && <p className="py-14 text-center text-body text-muted">Data tren belum tersedia.</p>}
    </WorkSheet>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-sm ${color}`} />{label}</span>;
}
function PlacementSnapshot({ count, href }: { count: number; href: string }) {
  return (
    <WorkSheet title="Penempatan Aktif" description="Penempatan berjalan dalam cakupan Anda." className="h-full">
      <div className="flex min-h-28 items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-info-surface text-info">
          <MapPin className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-3xl font-bold tabular-nums text-brand">{count}</p>
          <Link href={href} className="mt-1 inline-flex min-h-11 items-center gap-1 text-body font-semibold text-brand hover:underline">
            Lihat karyawan <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </WorkSheet>
  );
}
function PayrollLifecycle({ runs }: { runs: PayrollRun[] }) {
  const visible = runs.slice(-6);
  const max = Math.max(...visible.map((run) => run._count.slips), 1);
  return (
    <WorkSheet title="Aktivitas Payroll" description="Jumlah slip pada periode payroll terbaru." className="h-full">
      {visible.length ? (
        <div className="flex h-28 items-end gap-2 border-b border-border pt-3">
          {visible.map((run) => (
            <div key={run.id} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-caption font-semibold tabular-nums text-brand">{run._count.slips}</span>
              <span className="w-full max-w-8 rounded-t-sm bg-info" style={{ height: `${Math.max((run._count.slips / max) * 64, 4)}px` }} />
              <span className="max-w-full truncate text-[0.625rem] text-muted">
                {new Date(run.periodEnd).toLocaleDateString("id-ID", { month: "short" })}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-body text-muted">Belum ada periode payroll.</p>
      )}
    </WorkSheet>
  );
}
function TeamSnapshot({ people }: { people: NonNullable<MonitoringDay["people"]> }) {
  const visible = people.slice(0, 4);
  return (
    <WorkSheet title="Tim Hari Ini" description="Status terbaru anggota dalam cakupan aktif.">
      {visible.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((person) => (
            <Link key={person.employee.id} href={`/employees/${person.employee.id}/360`} className="flex min-w-0 items-center gap-3 rounded-lg bg-surface-subtle px-3 py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-caption font-bold text-white">
                {person.employee.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-brand">{person.employee.name}</span>
                <span className="block truncate text-caption text-muted">
                  {person.state === "CHECKED_OUT" ? "Presensi lengkap" : person.state === "CHECKED_IN" ? formatTime(person.attendance?.checkInAt) : person.state === "ON_LEAVE" ? "Cuti/Izin" : "Belum hadir"}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-body text-muted">Data anggota tim belum tersedia.</p>
      )}
    </WorkSheet>
  );
}
function Metric({
  label,
  value,
  href,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  href: string;
  icon: typeof UsersRound;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const colors = {
    neutral: "text-brand",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  };
  return (
    <Link
      href={href}
      className="group min-w-0 rounded-xl border border-border bg-paper p-2.5 shadow-card transition-colors hover:bg-surface-subtle sm:p-4"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-h-8 text-[0.6875rem] font-semibold leading-4 text-muted sm:min-h-9 sm:text-caption sm:leading-5">{label}</span>
        <span className={`grid size-7 shrink-0 place-items-center rounded-lg bg-surface-subtle sm:size-8 ${colors[tone]}`}><Icon className="size-3.5 sm:size-4" /></span>
      </span>
      <span className={`mt-0.5 block text-xl font-bold tabular-nums sm:mt-1 sm:text-3xl ${colors[tone]}`}>{value}</span>
    </Link>
  );
}
function Service({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof UsersRound;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-14 min-w-0 items-center gap-3 rounded-lg bg-surface-subtle px-3 py-3 text-body font-semibold text-brand transition-colors hover:bg-brand/10"
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
        {label}
      </span>
      <ArrowUpRight className="size-3.5 shrink-0 text-muted" />
    </Link>
  );
}
function ManagementSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.75fr)]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
