"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  CalendarDays,
  Clock3,
  Fingerprint,
  LogOut,
  MapPin,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import type { ApprovedFullDayAbsence, AttendanceMode, AttendanceRecord } from "@/lib/attendance";
import { approvedAbsenceLabel, attendanceStatus, latenessLabel } from "@/lib/attendance";
import { formatFullDate, formatTime } from "@/lib/format";
import { employmentTypeLabel } from "@/lib/employment";
import { canAttend } from "@/lib/navigation";
import { useSession } from "@/components/providers/SessionProvider";
import { EmployeeIdentityBand } from "./EmployeeIdentityBand";
import { AttendanceHistoryView } from "@/components/attendance/AttendanceHistoryView";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DossierPage, WorkSheet } from "@/components/ui/dossier";
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

  async function load() {
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
  }

  useEffect(() => {
    void load();
    window.addEventListener("attendance-updated", load);
    return () => window.removeEventListener("attendance-updated", load);
  }, [employee?.id]);
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
    <DossierPage className="space-y-5">
      <EmployeeIdentityBand
        name={employee.name}
        jobTitle={employee.jobTitle}
        photoUrl={employee.photoUrl}
        employmentType={employmentTypeLabel(employee.employmentType)}
        placement={employee.activePlacementName ?? (employee.employmentType === "STAFF_OFFICE" ? "Lokasi kerja belum ditetapkan" : "Penempatan belum tersedia")}
      />
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <div className="min-w-0 space-y-5">
          <TodayCard today={today} eligible={canAttend(session)} />
          {pendingCheckout ? (
            <Alert variant="warning" title="Jangan lupa absen pulang">
              Check-in Anda sudah tercatat. Selesaikan check-out melalui menu
              Presensi.
            </Alert>
          ) : pendingAbsence ? (
            <Alert variant="warning" title="Data absensi memerlukan perhatian">
              Ada kasus ketidakhadiran yang menunggu penjelasan Anda.{" "}
              <Link href="/absence-cases" className="font-semibold underline">
                Lihat detail
              </Link>
            </Alert>
          ) : null}
          <QuickServices capabilities={capabilities} />
        </div>
        <WorkSheet
          id="activity"
          title="Aktivitas Terbaru"
          description="Perubahan terakhir pada pengajuan Anda."
        >
          {activity.length ? (
            <div className="divide-y divide-border">
              {activity.map((item) => (
                <ActivityRow key={`${item.kind}-${item.id}`} item={item} />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-body text-muted">
              Belum ada aktivitas terbaru.
            </p>
          )}
          <Button asChild variant="ghost" className="mt-3 w-full">
            <Link href="/activity">
              Lihat pusat aktivitas <ArrowRight className="size-4" />
            </Link>
          </Button>
        </WorkSheet>
      </div>
      <WorkSheet
        title="Presensi Terakhir"
        description="Tiga catatan terbaru Anda."
      >
        <AttendanceHistoryView compact />
      </WorkSheet>
    </DossierPage>
  );
}

function TodayCard({
  today,
  eligible,
}: {
  today: TodayResponse | null;
  eligible: boolean;
}) {
  if (!eligible)
    return (
      <WorkSheet title="Presensi Hari Ini">
        <p className="text-body text-muted">
          Presensi tidak tersedia untuk profil atau penempatan Anda saat ini.
        </p>
      </WorkSheet>
    );
  const attendance = today?.attendance;
  const approvedAbsence = today?.approvedAbsence;
  return (
    <WorkSheet
      title="Presensi Hari Ini"
      description={formatFullDate(attendance?.date ?? new Date())}
      actions={
        <Badge
          variant={today?.attendanceMode === "MOBILE" ? "info" : "neutral"}
        >
          {today?.attendanceMode === "MOBILE" ? "Mobile" : "Lokasi kerja"}
        </Badge>
      }
    >
      <div className="grid grid-cols-2 border-y border-border">
        <TimeBlock label="Check-in" value={formatTime(attendance?.checkInAt)} />
        <TimeBlock
          label="Check-out"
          value={formatTime(attendance?.checkOutAt)}
        />
      </div>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
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
        {approvedAbsence ? (
          <StatusBadge status="APPROVED" label={approvedAbsenceLabel(approvedAbsence.type)} />
        ) : (
          <Button asChild className="w-full sm:w-auto">
            <Link href="/attendance?view=mine">
              <Fingerprint className="size-4" />
              {!attendance?.checkInAt
                ? "Check-in"
                : !attendance.checkOutAt
                  ? "Check-out"
                  : "Lihat Presensi"}
            </Link>
          </Button>
        )}
      </div>
    </WorkSheet>
  );
}

function TimeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-4 first:border-r first:border-border">
      <p className="dossier-label">{label}</p>
      <p className="mt-2 break-words text-2xl font-bold tabular-nums text-brand [overflow-wrap:anywhere]">
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
    label: "Resign",
    description: "Ajukan pengunduran diri",
    href: "/leave-requests?view=mine&new=RESIGN",
    icon: LogOut,
    color: "bg-danger-surface text-danger",
  },
  {
    label: "Riwayat",
    description: "Lihat catatan presensi",
    href: "/attendance/history?view=mine",
    icon: CalendarCheck,
    color: "bg-success-surface text-success",
  },
];
function QuickServices({
  capabilities,
}: {
  capabilities: "employee" | "marketing";
}) {
  // prettier-ignore
  const visible = capabilities === 'marketing' ? services.filter((service) => service.label !== 'Lembur') : services;
  return (
    <WorkSheet title="Layanan Karyawan">
      <div className="divide-y divide-border">
        {visible.map(({ icon: Icon, ...service }, index) => (
          <Link
            key={service.label}
            href={service.href}
            className="group flex min-h-16 min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0"
          >
            <span className="w-6 shrink-0 text-caption font-bold tabular-nums text-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-lg ${service.color}`}
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold text-brand">
                {service.label}
              </span>
              <span className="block break-words text-caption text-muted [overflow-wrap:anywhere]">
                {service.description}
              </span>
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" />
          </Link>
        ))}
      </div>
    </WorkSheet>
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
      className="flex min-h-16 min-w-0 items-center gap-3 py-3"
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
    <div className="space-y-5">
      <Skeleton className="h-64 rounded-[1.75rem]" />
      <div className="grid gap-5 xl:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
