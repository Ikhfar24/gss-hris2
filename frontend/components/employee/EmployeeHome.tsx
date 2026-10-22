"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Clock3,
  Fingerprint,
  MapPin,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import type { ApprovedFullDayAbsence, AttendanceMode, AttendanceRecord } from "@/lib/attendance";
import { approvedAbsenceLabel, attendanceStatus, latenessLabel } from "@/lib/attendance";
import { formatFullDate, formatTime } from "@/lib/format";
import { canAttend } from "@/lib/navigation";
import { useSession } from "@/components/providers/SessionProvider";
import { MobileIdentityHeader } from "./MobileIdentityHeader";
import { AttendanceHistoryView } from "@/components/attendance/AttendanceHistoryView";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, ErrorState } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";

interface TodayResponse {
  attendance: AttendanceRecord | null;
  attendanceMode: AttendanceMode;
  expectedLocation: { name: string };
  approvedAbsence: ApprovedFullDayAbsence | null;
}
interface EmployeeOverview {
  leaveRequests?: {
    id: string;
    type: string;
    status: string;
    requestedAt: string;
    startDate: string;
  }[];
  overtimeRequests?: {
    id: string;
    status: string;
    requestedAt: string;
    date: string;
  }[];
  absenceCases?: {
    id: string;
    status: string;
    createdAt: string;
    date: string;
  }[];
}
interface Activity {
  id: string;
  title: string;
  detail: string;
  at: string;
  href: string;
  kind: "attendance" | "leave" | "overtime";
}

export function EmployeeHome({
  capabilities = "employee",
}: {
  capabilities?: "employee" | "marketing";
}) {
  const { session } = useSession();
  const employee = session.employee;
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [overview, setOverview] = useState<EmployeeOverview | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!employee) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const [todayData, overviewData] = await Promise.all([
        canAttend(session)
          ? apiFetch<TodayResponse>("/attendance/me/today")
          : Promise.resolve(null),
        apiFetch<EmployeeOverview>("/employees/me/360"),
      ]);
      setToday(todayData);
      setOverview(overviewData);
    } catch (reason) {
      setError(reason instanceof ApiError || reason instanceof Error);
    } finally {
      setLoading(false);
    }
  }, [employee, session]);
  useEffect(() => {
    void load();
    window.addEventListener("attendance-updated", load);
    return () => window.removeEventListener("attendance-updated", load);
  }, [load]);
  if (!employee)
    return (
      <Alert variant="warning" title="Profil belum terhubung">
        Hubungi Admin HR untuk menghubungkan akun dengan profil karyawan.
      </Alert>
    );
  if (error) return <ErrorState retry={load} />;
  if (loading) return <EmployeeHomeSkeleton />;

  const activity = buildActivities(overview).slice(0, 3);
  const pendingAbsence = overview?.absenceCases?.find(
    (item) => item.status === "PENDING_EXPLANATION",
  );
  const pendingCheckout =
    today?.attendance?.checkInAt && !today.attendance.checkOutAt;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-4 sm:space-y-6">
      <span className="sr-only">PRIBADI</span>
      <MobileIdentityHeader className="sm:py-2" />

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)] lg:items-start">
        <div className="min-w-0 space-y-5">
          <TodayCard today={today} eligible={canAttend(session)} />
          {pendingAbsence && !pendingCheckout ? (
            <Alert variant="warning" title="Data absensi memerlukan perhatian">
              Ada kasus ketidakhadiran yang menunggu penjelasan Anda.{" "}
              <Link href="/absence-cases" className="font-semibold underline">
                Lihat detail
              </Link>
            </Alert>
          ) : null}
          <QuickServices capabilities={capabilities} />
        </div>
        <section id="activity" aria-labelledby="activity-title" className="min-w-0">
          <div className="mb-2 flex items-end justify-between gap-3 px-1">
            <div>
              <h2 id="activity-title" className="text-section-title text-brand">
                Aktivitas Terbaru
              </h2>
              <p className="mt-0.5 text-caption text-muted">
                Status pengajuan yang terakhir berubah.
              </p>
            </div>
            <Link
              href="/activity"
              className="inline-flex min-h-11 shrink-0 items-center gap-1 text-caption font-semibold text-brand underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:min-h-8"
            >
              Lihat semua <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {activity.length ? (
            <div className="divide-y divide-border rounded-xl bg-paper px-4 shadow-card">
              {activity.map((item) => (
                <ActivityRow key={`${item.kind}-${item.id}`} item={item} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-paper px-4 py-8 text-center text-body text-muted shadow-card">
              Belum ada aktivitas terbaru.
            </p>
          )}
        </section>
      </div>
      <section aria-labelledby="attendance-history-title" className="min-w-0">
        <div className="mb-2 px-1">
          <h2 id="attendance-history-title" className="text-section-title text-brand">
            Presensi Terakhir
          </h2>
          <p className="mt-0.5 text-caption text-muted">
            Tiga catatan terbaru Anda.
          </p>
        </div>
        <div className="rounded-xl bg-paper p-4 shadow-card sm:p-5">
          <AttendanceHistoryView compact />
        </div>
      </section>
    </div>
  );
}

function TodayCard({
  today,
  eligible,
}: {
  today: TodayResponse | null;
  eligible: boolean;
}) {
  const [clock, setClock] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClock(
        now.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "Asia/Jakarta",
        }) + " WIB",
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!eligible)
    return (
      <section className="rounded-xl bg-paper p-4 shadow-card sm:p-5">
        <h2 className="text-section-title text-brand">Presensi Hari Ini</h2>
        <p className="mt-1 text-body text-muted">
          Presensi tidak tersedia untuk profil atau penempatan Anda saat ini.
        </p>
      </section>
    );
  const attendance = today?.attendance;
  const approvedAbsence = today?.approvedAbsence;
  return (
    <section className="rounded-xl bg-paper p-4 shadow-card sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-section-title text-brand">Presensi Hari Ini</h2>
            {clock && (
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-subtle px-2 py-0.5 font-mono text-[0.75rem] font-semibold text-brand shadow-control">
                <Clock3 className="size-3 text-muted" />
                {clock}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-caption text-muted">
            {formatFullDate(attendance?.date ?? new Date())}
          </p>
        </div>
        <Badge
          variant={today?.attendanceMode === "MOBILE" ? "info" : "neutral"}
          className="shrink-0 whitespace-nowrap text-xs"
        >
          {today?.attendanceMode === "MOBILE" ? "Mobile" : "Geofence"}
        </Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg bg-surface-subtle">
        <TimeBlock label="Check-in" value={formatTime(attendance?.checkInAt)} />
        <TimeBlock
          label="Check-out"
          value={formatTime(attendance?.checkOutAt)}
        />
      </div>
      <div className="mt-3 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-brand">
            {approvedAbsence ? `${approvedAbsenceLabel(approvedAbsence.type)} disetujui` : attendance ? attendanceStatus(attendance) : "Belum presensi"}
          </p>
          <p className="mt-1 break-words text-caption text-muted [overflow-wrap:anywhere]">
            <MapPin className="mr-1 inline size-3.5" />
            {today?.expectedLocation.name ?? "Lokasi kerja"}
          </p>
          {attendance && (
            <p className="mt-1 text-caption text-muted">
              {latenessLabel(attendance.latenessStatus)}
            </p>
          )}
        </div>
        {approvedAbsence && (
          <StatusBadge status="APPROVED" label={approvedAbsenceLabel(approvedAbsence.type)} />
        )}
      </div>
      {!approvedAbsence && (
        <Button asChild size="lg" className="mt-4 w-full">
          <Link href="/attendance?view=mine">
            <Fingerprint className="size-5" />
            {!attendance?.checkInAt
              ? "Presensi Sekarang"
              : !attendance.checkOutAt
                ? "Presensi Pulang"
                : "Lihat Presensi"}
          </Link>
        </Button>
      )}
    </section>
  );
}

function TimeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-3.5 first:border-r first:border-border">
      <p className="text-caption font-semibold text-muted">{label}</p>
      <p className="mt-1.5 break-words text-2xl font-bold tabular-nums text-brand [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}

const services = [
  {
    label: "Cuti & Izin",
    description: "Ajukan kebutuhan izin kerja",
    href: "/leave-requests?view=mine",
    icon: CalendarDays,
    color: "bg-info-surface text-info",
  },
  {
    label: "Lembur",
    description: "Ajukan jadwal lembur",
    href: "/overtime-requests?view=mine",
    icon: Clock3,
    color: "bg-brand/10 text-brand",
  },
  {
    label: "Riwayat",
    description: "Lihat catatan presensi",
    href: "/attendance/history?view=mine",
    icon: CalendarCheck,
    color: "bg-success-surface text-success",
  },
  {
    label: "Slip Gaji",
    description: "Lihat rincian penghasilan",
    href: "/payroll?view=mine",
    icon: ReceiptText,
    color: "bg-warning-surface text-warning",
  },
];
const marketingService = {
  label: "Profil",
  description: "Lihat data pribadi",
  href: "/profile",
  icon: UserRound,
  color: "bg-info-surface text-info",
};
function QuickServices({
  capabilities,
}: {
  capabilities: "employee" | "marketing";
}) {
  // prettier-ignore
  const visible = capabilities === 'marketing' ? [...services.filter((service) => service.label !== 'Lembur'), marketingService] : services;
  return (
    <section aria-labelledby="quick-services-title">
      <h2 id="quick-services-title" className="mb-2 px-1 text-section-title text-brand">
        Akses Cepat
      </h2>
      <div className="grid grid-cols-4 gap-2 lg:grid-cols-2 xl:grid-cols-4">
        {visible.map(({ icon: Icon, ...service }) => (
          <Link
            key={service.label}
            href={service.href}
            className="group flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-xl bg-paper p-2 text-center shadow-card transition-[background-color,transform] hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transform-none sm:min-h-28 sm:p-3.5 lg:items-start lg:text-left xl:items-center xl:text-center"
          >
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-lg sm:size-10 ${service.color}`}
            >
              <Icon className="size-4 sm:size-5" />
            </span>
            <span className="min-w-0">
              <span className="block break-words text-caption font-semibold leading-tight text-brand sm:text-body [overflow-wrap:anywhere]">
                {service.label}
              </span>
              <span className="mt-1 hidden break-words text-caption text-muted xl:block [overflow-wrap:anywhere]">
                {service.description}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function buildActivities(data: EmployeeOverview | null): Activity[] {
  if (!data) return [];
  const leaves: Activity[] = (data.leaveRequests ?? []).map((item) => ({
    id: item.id,
    title:
      item.type === "RESIGN"
        ? "Pengajuan resign"
        : `Pengajuan ${item.type.replaceAll("_", " ").toLowerCase()}`,
    detail: item.status,
    at: item.requestedAt,
    href: "/leave-requests",
    kind: "leave",
  }));
  const overtime: Activity[] = (data.overtimeRequests ?? []).map((item) => ({
    id: item.id,
    title: "Pengajuan lembur",
    detail: item.status,
    at: item.requestedAt,
    href: "/overtime-requests",
    kind: "overtime",
  }));
  return [...leaves, ...overtime].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}
function ActivityRow({ item }: { item: Activity }) {
  return (
    <Link
      href={item.href}
      className="flex min-h-16 min-w-0 items-center gap-3 py-3 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-subtle text-brand">
        {item.kind === "overtime" ? (
          <Clock3 className="size-4" />
        ) : (
          <CalendarDays className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-body font-semibold text-brand [overflow-wrap:anywhere]">
          {item.title}
        </span>
      </span>
      <StatusBadge status={item.detail} />
    </Link>
  );
}
function EmployeeHomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex items-center justify-between px-1 py-1">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-4 w-52 rounded" />
        </div>
        <Skeleton className="size-16 rounded-full" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
        <div className="space-y-5">
          <Skeleton className="h-72 rounded-xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="aspect-square rounded-xl" />
            <Skeleton className="aspect-square rounded-xl" />
          </div>
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
