"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Download,
  Fingerprint,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import type { ApprovedFullDayAbsence, AttendanceMode, AttendanceRecord } from "@/lib/attendance";
import { approvedAbsenceLabel, attendanceStatus } from "@/lib/attendance";
import { formatFullDate, formatTime } from "@/lib/format";
import { canAttend } from "@/lib/navigation";
import { useSession } from "@/components/providers/SessionProvider";
import { EmployeeIdentityBand } from "@/components/employee/EmployeeIdentityBand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DossierPage,
  MetricStrip,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  async function load(selectedType = type) {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(false);
    const filter = selectedType ? `employmentType=${selectedType}` : "";
    try {
      const [nextSummary, nextAttention, employees, nextToday] =
        await Promise.all([
          apiFetch<Summary>(`/dashboard/summary${filter ? `?${filter}` : ""}`),
          apiFetch<Attention[]>("/dashboard/attention"),
          apiFetch<{ meta: { total: number } }>(
            `/employees?page=1&pageSize=1&status=ACTIVE${selectedType ? `&employmentType=${selectedType}` : ""}`,
          ),
          canAttend(session)
            ? apiFetch<Today>("/attendance/me/today").catch(() => null)
            : Promise.resolve(null),
        ]);
      if (currentRequest !== requestId.current) return;
      setSummary(nextSummary);
      setAttention(nextAttention);
      setActiveEmployees(employees.meta.total);
      setToday(nextToday);
    } catch (reason) {
      if (currentRequest === requestId.current)
        setError(reason instanceof ApiError || reason instanceof Error);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const refreshAttendance = () => void load();
    window.addEventListener("attendance-updated", refreshAttendance);
    return () =>
      window.removeEventListener("attendance-updated", refreshAttendance);
  }, [type]);
  if (loading && !summary) return <ManagementSkeleton />;
  if (!summary) return <ErrorState retry={load} />;

  const employee = session.employee;
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
    <DossierPage className="space-y-5">
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
      <EmployeeIdentityBand
        name={employee?.name ?? session.email}
        jobTitle={employee?.jobTitle ?? (isCoordinator ? "Koordinator" : "Admin HR")}
        photoUrl={employee?.photoUrl}
        context={isCoordinator ? "Koordinator · Pribadi & Tim" : "Admin HR · Pribadi & Workforce"}
        placement={employee ? employee.activePlacementName ?? (employee.employmentType === "STAFF_OFFICE" ? "Lokasi kerja belum ditetapkan" : "Penempatan belum tersedia") : undefined}
      />
      <section aria-busy={loading}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">
              {isCoordinator ? "TIM" : "ORGANISASI"}
            </p>
            <h2 className="text-xl font-bold text-navy">{contextTitle}</h2>
            {loading && (
              <p className="mt-1 text-xs text-slate-400" role="status">
                Memperbarui data...
              </p>
            )}
          </div>
          {availableTypes.length > 1 && (
            <SegmentedControl
              aria-label="Filter jenis tenaga"
              value={type}
              onValueChange={setType}
              options={typeOptions}
            />
          )}
        </div>
        <MetricStrip className="md:grid-cols-3 xl:grid-cols-5">
          <Metric
            label="Karyawan Aktif"
            value={activeEmployees}
            href={withType("/employees")}
          />
          <Metric
            label="Hadir"
            value={summary.attendance.hadir}
            href={withType("/attendance?view=team")}
            tone="success"
          />
          <Metric
            label="Terlambat"
            value={summary.attendance.terlambat}
            href={withType("/attendance?view=team&state=LATE")}
            tone="warning"
          />
          <Metric
            label="Perlu Review"
            value={summary.attendance.perluDitinjau}
            href={withType(
              "/attendance?view=team&validationStatus=NEEDS_REVIEW",
            )}
            tone="danger"
          />
          <Metric
            label="Belum Absen"
            value={summary.attendance.tidakHadir}
            href={withType("/attendance?view=team&state=NOT_ATTENDED")}
          />
        </MetricStrip>
      </section>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]">
        <PersonalAttendance today={today} enabled={canAttend(session)} />
        <WorkSheet
          id="actions"
          title="Perlu Tindakan"
          description="Antrean nyata dari workflow yang menjadi kewenangan Anda."
        >
          {attention.filter((item) => item.count > 0).length ? (
            <div className="divide-y divide-border">
              {attention
                .filter((item) => item.count > 0)
                .map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="group flex min-h-16 min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0"
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
      <WorkSheet
        title="Layanan Pribadi"
        description="Akses pribadi terpisah dari kewenangan tim dan Workforce."
      >
        <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5">
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
          <span className="font-semibold text-brand">PRIBADI</span> ·{" "}
          {formatFullDate(attendance?.date ?? new Date())}
        </>
      }
      actions={
        today && (
          <Badge
            variant={today.attendanceMode === "MOBILE" ? "info" : "neutral"}
          >
            {today.attendanceMode === "MOBILE" ? "Mobile" : "Berbasis lokasi"}
          </Badge>
        )
      }
    >
      <div className="grid grid-cols-2 border-y border-border">
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
function Metric({
  label,
  value,
  href,
  tone = "neutral",
}: {
  label: string;
  value: number;
  href: string;
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
      className="dossier-index min-w-0 border-y border-r border-border bg-paper px-4 py-4 transition-colors hover:bg-surface-subtle"
    >
      <span className="block text-caption font-semibold text-muted">
        {label}
      </span>
      <span
        className={`mt-2 block text-2xl font-bold tabular-nums ${colors[tone]}`}
      >
        {value}
      </span>
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
      className="group flex min-h-16 min-w-0 items-center gap-3 px-3 py-3 text-body font-semibold text-brand transition-colors hover:bg-surface-subtle"
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
    <div className="space-y-5">
      <Skeleton className="h-52 rounded-[1.75rem]" />
      <div className="grid gap-5 xl:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}
