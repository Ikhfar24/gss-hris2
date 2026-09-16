"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, ApiError, protectedMediaUrl } from "@/lib/api";
import { useSession } from "@/components/providers/SessionProvider";
import { EmployeeFullProfile } from "@/components/employee/EmployeeFullProfile";
import {
  AdminEmployeeProfile,
  CoordinatorEmployeeProfile,
} from "@/components/management/ManagementEmployeeProfile";
import { ErrorState } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/badge";
import { DataRegion, DossierPage, WorkSheet } from "@/components/ui/dossier";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Employee360 {
  profile: Record<string, any>;
  recentAttendance?: Record<string, any>[];
  leaveRequests?: Record<string, any>[];
  temporaryAssignments?: Record<string, any>[];
  absenceCases?: Record<string, any>[];
  overtimeRequests?: Record<string, any>[];
  profileChangeHistory?: Record<string, any>[];
}

function date(value: unknown) {
  if (!value) return "-";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : parsed.toLocaleDateString("id-ID");
}

function value(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return "-";
  return String(value);
}

function Section({
  title,
  rows,
  columns,
}: {
  title: string;
  rows?: Record<string, any>[];
  columns: { key: string; label: string; format?: "date" }[];
}) {
  if (!rows)
    return (
      <WorkSheet title={title}>
        <p className="text-body text-muted">
          Bagian ini tidak tersedia untuk akses Anda.
        </p>
      </WorkSheet>
    );
  return (
    <WorkSheet title={title}>
      {rows.length === 0 ? (
        <p className="text-body text-muted">Belum ada data.</p>
      ) : (
        <DataRegion>
          <table className="min-w-[640px] text-sm">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th scope="col" key={column.key}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id ?? index}>
                  {columns.map((column) => (
                    <td key={column.key} className="tabular-nums">
                      {column.key.toLowerCase().includes("status") ? (
                        <StatusBadge status={value(row[column.key])} />
                      ) : column.format === "date" ? (
                        date(row[column.key])
                      ) : (
                        value(row[column.key])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </DataRegion>
      )}
    </WorkSheet>
  );
}

export default function Employee360Page() {
  const params = useParams<{ id: string }>();
  const { session } = useSession();
  const [data, setData] = useState<Employee360 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  async function load() {
    try {
      setData(await apiFetch<Employee360>(`/employees/${params.id}/360`));
      setPhotoFailed(false);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Gagal memuat Profil Lengkap",
      );
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error)
    return (
      <div>
        <Link
          href={session.role === "KARYAWAN" ? "/profile" : "/employees"}
          className="text-sm underline"
        >
          Kembali
        </Link>
        <ErrorState retry={load} />
      </div>
    );
  if (!data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  if (session.role === "KARYAWAN") return <EmployeeFullProfile data={data} />;
  if (session.role === "KOORDINATOR")
    return <CoordinatorEmployeeProfile data={data} />;
  // prettier-ignore
  if (session.role === 'ADMIN_HR') return <AdminEmployeeProfile data={data} onReload={load} />;

  const profile = data.profile;
  const initials =
    String(profile.name ?? "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";
  return (
    <DossierPage className="max-w-6xl">
      <Link href="/employees" className="text-sm underline">
        Kembali ke Data Karyawan
      </Link>
      <section className="dossier-index mt-4 overflow-hidden rounded-xl bg-binder px-5 py-5 text-white shadow-sheet">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <h1>Profil Lengkap</h1>
            <p className="mt-2 break-words text-lg font-semibold [overflow-wrap:anywhere]">
              {profile.name}
            </p>
            <p className="mt-1 text-body text-white/65">
              {profile.employeeNumber
                ? `NIP ${profile.employeeNumber}`
                : "NIP belum tersedia"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-caption text-white/70">
              <StatusBadge status={value(profile.status)} />
              <span>
                {value(profile.jobTitle)} · {value(profile.employmentType)}
              </span>
              <span className="tabular-nums">
                Bergabung {date(profile.joinDate)}
              </span>
            </div>
          </div>
          {profile.photoUrl && !photoFailed ? (
            <img
              src={protectedMediaUrl(String(profile.photoUrl))}
              alt={`Foto profil ${profile.name}`}
              onError={() => setPhotoFailed(true)}
              className="h-20 w-20 rounded-lg border border-white/20 object-cover"
            />
          ) : (
            <div
              aria-label="Foto profil belum tersedia"
              className="flex h-20 w-20 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-xl font-semibold text-white"
            >
              {initials}
            </div>
          )}
        </div>
      </section>
      <Tabs defaultValue="work" className="mt-5">
        <TabsList>
          <TabsTrigger value="work">Pekerjaan</TabsTrigger>
          <TabsTrigger value="attendance">Presensi</TabsTrigger>
          <TabsTrigger value="requests">Pengajuan</TabsTrigger>
          <TabsTrigger value="changes">Perubahan</TabsTrigger>
        </TabsList>
        <TabsContent value="work" className="grid gap-4">
          <Section
            title="Riwayat Penempatan"
            rows={profile.placements}
            columns={[
              { key: "startDate", label: "Mulai", format: "date" },
              { key: "endDate", label: "Selesai", format: "date" },
              { key: "status", label: "Status" },
            ]}
          />
          <Section
            title="Riwayat Kontrak"
            rows={profile.contracts}
            columns={[
              { key: "type", label: "Jenis" },
              { key: "startDate", label: "Mulai", format: "date" },
              { key: "endDate", label: "Selesai", format: "date" },
              { key: "status", label: "Status" },
            ]}
          />
        </TabsContent>
        <TabsContent value="attendance" className="grid gap-4">
          <Section
            title="Absensi Terbaru"
            rows={data.recentAttendance}
            columns={[
              { key: "date", label: "Tanggal", format: "date" },
              { key: "checkInAt", label: "Masuk" },
              { key: "checkOutAt", label: "Pulang" },
              { key: "latenessStatus", label: "Keterlambatan" },
              { key: "validationStatus", label: "Validasi" },
            ]}
          />
          <Section
            title="Kasus Ketidakhadiran"
            rows={data.absenceCases}
            columns={[
              { key: "date", label: "Tanggal", format: "date" },
              { key: "status", label: "Status" },
              { key: "note", label: "Catatan" },
            ]}
          />
        </TabsContent>
        <TabsContent value="requests" className="grid gap-4">
          <Section
            title="Cuti, Izin, dan Resign"
            rows={data.leaveRequests}
            columns={[
              { key: "type", label: "Jenis" },
              { key: "startDate", label: "Mulai", format: "date" },
              { key: "endDate", label: "Selesai", format: "date" },
              { key: "status", label: "Status" },
            ]}
          />
          <Section
            title="Penugasan Sementara"
            rows={data.temporaryAssignments}
            columns={[
              { key: "startDate", label: "Mulai", format: "date" },
              { key: "endDate", label: "Selesai", format: "date" },
              { key: "status", label: "Status" },
              { key: "reason", label: "Alasan" },
            ]}
          />
          <Section
            title="Lembur"
            rows={data.overtimeRequests}
            columns={[
              { key: "date", label: "Tanggal", format: "date" },
              { key: "startTime", label: "Mulai" },
              { key: "endTime", label: "Selesai" },
              { key: "status", label: "Status" },
              { key: "reason", label: "Alasan" },
            ]}
          />
        </TabsContent>
        <TabsContent value="changes">
          <Section
            title="Riwayat Perubahan Profil"
            rows={data.profileChangeHistory}
            columns={[
              { key: "requestedAt", label: "Diajukan", format: "date" },
              { key: "reviewedAt", label: "Ditinjau", format: "date" },
              { key: "status", label: "Status" },
              { key: "reviewNote", label: "Catatan" },
            ]}
          />
        </TabsContent>
      </Tabs>
    </DossierPage>
  );
}
