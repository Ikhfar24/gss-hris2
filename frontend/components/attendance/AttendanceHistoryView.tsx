"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  MapPin,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import type { AttendanceRecord } from "@/lib/attendance";
import {
  attendanceStatus,
  latenessLabel,
  validationLabels,
} from "@/lib/attendance";
import {
  formatMonth,
  formatShortDate,
  formatTime,
  monthKey,
} from "@/lib/format";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextBand,
  DataRegion,
  MobileRecord,
  RecordActions,
  RecordBody,
  RecordHeader,
} from "@/components/ui/dossier";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";

export function AttendanceHistoryView({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const data = await apiFetch<AttendanceRecord[]>("/attendance/me/history");
      setRows(data);
      setSelectedMonth((current) => current || monthKey(data[0]?.date));
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
  if (loading) return <HistorySkeleton compact={compact} />;
  if (error) return <ErrorState retry={load} />;

  const months = [
    ...new Set(rows.map((row) => monthKey(row.date)).filter(Boolean)),
  ];
  const visible = compact
    ? rows.slice(0, 3)
    : rows.filter(
        (row) => !selectedMonth || monthKey(row.date) === selectedMonth,
      );
  if (!rows.length)
    return (
      <EmptyState
        title="Belum ada riwayat presensi"
        description="Riwayat check-in dan check-out Anda akan tampil di sini."
      />
    );

  return (
    <div className="min-w-0">
      {!compact && (
        <ContextBand
          title="Riwayat Presensi"
          description="Catatan waktu, lokasi, dan hasil validasi presensi per bulan."
          actions={
            <>
              <label className="sr-only" htmlFor="attendance-month">
                Pilih bulan
              </label>
              <select
                id="attendance-month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="input min-h-11 w-full sm:w-48"
              >
                {months.map((month) => (
                  <option key={month} value={month}>
                    {formatMonth(`${month}-01T12:00:00`)}
                  </option>
                ))}
              </select>
            </>
          }
        />
      )}
      <div className={compact ? "space-y-3" : "space-y-3 md:hidden"}>
        {visible.map((row) => (
          <AttendanceHistoryRecord key={row.id} row={row} />
        ))}
      </div>
      {!compact && (
        <DataRegion className="hidden md:block">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Status</th>
                <th>Waktu</th>
                <th>Lokasi</th>
                <th>Ketepatan</th>
                <th>
                  <span className="sr-only">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <AttendanceHistoryRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </DataRegion>
      )}
      {compact && (
        <Button asChild variant="ghost" className="mt-3 w-full">
          <Link href="/attendance/history">
            Lihat Semua Riwayat <ChevronRight className="size-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}

function AttendanceHistoryRecord({ row }: { row: AttendanceRecord }) {
  const validation =
    validationLabels[row.validationStatus] ??
    row.validationStatus.replaceAll("_", " ");
  return (
    <MobileRecord>
      <RecordHeader
        title={formatShortDate(row.date)}
        detail={attendanceStatus(row)}
        status={
          <StatusBadge status={row.validationStatus} label={validation} />
        }
      />
      <RecordBody>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="dossier-label">Check-in</p>
            <p className="mt-1 font-semibold tabular-nums">
              <Clock3 className="mr-1 inline size-3.5 text-muted" />
              {formatTime(row.checkInAt)}
            </p>
          </div>
          <div>
            <p className="dossier-label">Check-out</p>
            <p className="mt-1 font-semibold tabular-nums">
              {formatTime(row.checkOutAt)}
            </p>
          </div>
        </div>
        <p className="mt-4 break-words border-t border-border pt-3 text-caption text-muted [overflow-wrap:anywhere]">
          <MapPin className="mr-1 inline size-3.5" />
          {row.location?.name ??
            row.checkInLocationName ??
            "Lokasi tidak tersedia"}
        </p>
      </RecordBody>
      <RecordActions>
        <Badge
          variant={
            row.latenessStatus === "LATE"
              ? "danger"
              : row.latenessStatus === "ON_TIME"
                ? "success"
                : "info"
          }
        >
          {latenessLabel(row.latenessStatus)}
        </Badge>
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link
            href={`/attendance/history/${row.id}`}
            aria-label={`Lihat detail presensi ${formatShortDate(row.date)}`}
          >
            Detail <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </RecordActions>
    </MobileRecord>
  );
}

function AttendanceHistoryRow({ row }: { row: AttendanceRecord }) {
  const validation =
    validationLabels[row.validationStatus] ??
    row.validationStatus.replaceAll("_", " ");
  return (
    <tr>
      <td>
        <div className="flex items-center gap-2 whitespace-nowrap font-semibold text-brand">
          <CalendarDays className="size-4 text-muted" />
          {formatShortDate(row.date)}
        </div>
      </td>
      <td>
        <div className="flex max-w-56 flex-wrap gap-2">
          <span className="break-words font-medium [overflow-wrap:anywhere]">
            {attendanceStatus(row)}
          </span>
          <StatusBadge status={row.validationStatus} label={validation} />
        </div>
      </td>
      <td className="whitespace-nowrap font-semibold tabular-nums">
        {formatTime(row.checkInAt)} <span className="px-1 text-muted">-</span>{" "}
        {formatTime(row.checkOutAt)}
      </td>
      <td>
        <span className="block max-w-64 break-words text-muted [overflow-wrap:anywhere]">
          {row.location?.name ??
            row.checkInLocationName ??
            "Lokasi tidak tersedia"}
        </span>
      </td>
      <td>
        <Badge
          variant={
            row.latenessStatus === "LATE"
              ? "danger"
              : row.latenessStatus === "ON_TIME"
                ? "success"
                : "info"
          }
        >
          {latenessLabel(row.latenessStatus)}
        </Badge>
      </td>
      <td>
        <Button asChild variant="ghost" size="sm" className="size-10 px-0">
          <Link
            href={`/attendance/history/${row.id}`}
            aria-label={`Lihat detail presensi ${formatShortDate(row.date)}`}
          >
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </td>
    </tr>
  );
}

function HistorySkeleton({ compact }: { compact: boolean }) {
  return (
    <div className="space-y-3">
      {!compact && <Skeleton className="h-16 w-full" />}
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-32 w-full rounded-2xl" />
      ))}
    </div>
  );
}
