"use client";

import Link from "next/link";
import {
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  Clock3,
  FileText,
  MapPin,
  Pencil,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { ApiError, apiFetch, uploadFile } from "@/lib/api";
import { formatDate, formatTime } from "@/lib/format";
import { EmployeeAvatar } from "@/components/employee/EmployeeAvatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { ContextBand, DossierPage, WorkSheet } from "@/components/ui/dossier";

interface ProfileData {
  profile: Record<string, any>;
  recentAttendance?: Record<string, any>[];
  leaveRequests?: Record<string, any>[];
  temporaryAssignments?: Record<string, any>[];
  absenceCases?: Record<string, any>[];
  overtimeRequests?: Record<string, any>[];
  profileChangeHistory?: Record<string, any>[];
}

export function CoordinatorEmployeeProfile({ data }: { data: ProfileData }) {
  const profile = data.profile;
  return (
    <DossierPage className="max-w-6xl space-y-5">
      <Identity profile={profile} eyebrow="TIM SAYA" />
      <div className="grid gap-4 lg:grid-cols-2">
        <InfoCard
          title="Pekerjaan"
          items={[
            ["Jabatan", profile.jobTitle],
            ["Jenis tenaga", label(profile.employmentType)],
            ["Status", label(profile.status)],
            ["Bergabung", formatDate(profile.joinDate)],
            ["Mode presensi", label(profile.attendanceMode)],
          ]}
        />
        <PlacementCard placements={profile.placements} />
      </div>
      <Alert title="Akses Koordinator">
        Informasi bank, BPJS, gaji, tarif harian, dan kompensasi kontrak tidak
        tersedia. Koordinator tidak memiliki tindakan edit atau lifecycle
        Employee.
      </Alert>
      <HistoryGrid data={data} />
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild variant="secondary">
          <Link href={`/attendance?employeeId=${profile.id}`}>
            Lihat Absensi
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/leave-requests">Cuti & Izin Tim</Link>
        </Button>
      </div>
    </DossierPage>
  );
}

export function AdminEmployeeProfile({
  data,
  onReload,
}: {
  data: ProfileData;
  onReload: () => Promise<void>;
}) {
  const profile = data.profile;
  const [editOpen, setEditOpen] = useState(false);
  const [action, setAction] = useState<
    "deactivate" | "reactivate" | "delete" | null
  >(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [contract, setContract] = useState({
    type: "PKWT",
    startDate: "",
    endDate: "",
    baseSalary: "",
  });
  const [form, setForm] = useState({
    name: profile.name ?? "",
    employeeNumber: profile.employeeNumber ?? "",
    nik: profile.nik ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    address: profile.address ?? "",
    jobTitle: profile.jobTitle ?? "",
    attendanceMode: profile.attendanceMode ?? "GEOFENCE",
    reason: "",
  });

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/employees/${profile.id}`, {
        method: "PATCH",
        body: {
          ...form,
          employeeNumber: form.employeeNumber || undefined,
          nik: form.nik || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          address: form.address || undefined,
          jobTitle: form.jobTitle || undefined,
        },
      });
      setEditOpen(false);
      setMessage("Data master karyawan diperbarui.");
      await onReload();
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Gagal memperbarui karyawan",
      );
    } finally {
      setBusy(false);
    }
  }
  async function runLifecycle() {
    if (!action || reason.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(
        `/employees/${profile.id}${action === "delete" ? "" : `/${action}`}`,
        {
          method: action === "delete" ? "DELETE" : "PATCH",
          body: { reason: reason.trim() },
        },
      );
      setAction(null);
      setReason("");
      setMessage(
        action === "delete"
          ? "Permintaan hapus aman selesai."
          : "Status karyawan diperbarui.",
      );
      if (action !== "delete") await onReload();
    } catch (failure) {
      setError(
        failure instanceof ApiError ? failure.message : "Aksi lifecycle gagal",
      );
    } finally {
      setBusy(false);
    }
  }
  async function changePhoto() {
    if (!photo) return;
    setBusy(true);
    setError(null);
    try {
      await uploadFile(`/employees/${profile.id}/profile-photo`, photo);
      setPhoto(null);
      setMessage("Foto profil diperbarui.");
      await onReload();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Gagal memperbarui foto",
      );
    } finally {
      setBusy(false);
    }
  }
  async function addContract(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/contracts", {
        method: "POST",
        body: {
          employeeId: profile.id,
          type: contract.type,
          startDate: contract.startDate,
          endDate: contract.endDate || undefined,
          baseSalary: contract.baseSalary
            ? Number(contract.baseSalary)
            : undefined,
        },
      });
      setContract({ type: "PKWT", startDate: "", endDate: "", baseSalary: "" });
      setMessage("Kontrak ditambahkan.");
      await onReload();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Gagal menambah kontrak",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <DossierPage className="max-w-6xl space-y-5">
      <Identity profile={profile} eyebrow="ADMINISTRASI KARYAWAN" />
      {message && <Alert variant="success">{message}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}
      <Card>
        <CardContent className="flex flex-wrap gap-2 p-4">
          <Button onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Edit Data
          </Button>
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm font-semibold text-slate-700">
            <Camera className="size-4" />
            {profile.photoUrl ? "Ganti Foto" : "Unggah Foto"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
            />
          </label>
          {photo && (
            <Button variant="secondary" disabled={busy} onClick={changePhoto}>
              Simpan Foto
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() =>
              setAction(
                profile.status === "INACTIVE" ? "reactivate" : "deactivate",
              )
            }
          >
            {profile.status === "INACTIVE" ? "Aktifkan" : "Nonaktifkan"}
          </Button>
          <Button
            variant="secondary"
            className="hidden border-red-200 text-red-700 hover:bg-red-50 md:inline-flex"
            onClick={() => setAction("delete")}
          >
            Hapus Aman
          </Button>
          <Button asChild variant="secondary">
            <Link href="/placement-requests">Administrasi Penempatan</Link>
          </Button>
          <details className="w-full rounded-xl border border-slate-200 md:hidden">
            <summary className="min-h-10 cursor-pointer px-4 py-2 text-sm font-semibold text-slate-600">
              Tindakan lainnya
            </summary>
            <div className="border-t p-3">
              <p className="mb-3 text-xs text-slate-500">
                Hapus Aman hanya berhasil bila karyawan tidak memiliki akun,
                audit, atau riwayat terlindungi.
              </p>
              <Button
                variant="secondary"
                className="w-full border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => setAction("delete")}
              >
                Hapus Aman
              </Button>
            </div>
          </details>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <InfoCard
          title="Profil"
          items={[
            ["Nama", profile.name],
            ["NIP", profile.employeeNumber],
            ["NIK", profile.nik],
            ["Email", profile.email],
            ["Telepon", profile.phone],
            ["Alamat", profile.address],
          ]}
        />
        <InfoCard
          title="Pekerjaan"
          items={[
            ["Jabatan", profile.jobTitle],
            ["Jenis tenaga", label(profile.employmentType)],
            ["Status", label(profile.status)],
            ["Bergabung", formatDate(profile.joinDate)],
            ["Wajib presensi", profile.attendanceRequired ? "Ya" : "Tidak"],
            ["Mode presensi", label(profile.attendanceMode)],
          ]}
        />
      </div>
      <PlacementCard placements={profile.placements} />
      <Card>
        <CardHeader>
          <CardTitle>Kontrak</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {profile.contracts?.map((item: any) => (
              <div key={item.id} className="rounded-xl bg-surface-subtle p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{item.type}</strong>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-1 tabular-nums text-muted">
                  {formatDate(item.startDate)} -{" "}
                  {item.endDate ? formatDate(item.endDate) : "Tanpa batas"}
                </p>
                <p className="mt-1">
                  Gaji pokok:{" "}
                  {item.baseSalary == null
                    ? "-"
                    : `Rp ${Number(item.baseSalary).toLocaleString("id-ID")}`}
                </p>
                {item.notes && (
                  <p className="mt-1 text-muted">{item.notes}</p>
                )}
              </div>
            ))}
            {!profile.contracts?.length && (
              <p className="text-body text-muted">Belum ada kontrak.</p>
            )}
          </div>
          <form
            onSubmit={addContract}
            className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2"
          >
            <select
              value={contract.type}
              onChange={(event) =>
                setContract({ ...contract, type: event.target.value })
              }
              className="input"
            >
              <option value="PKWT">PKWT</option>
              <option value="PKWTT">PKWTT</option>
              <option value="OTHER">Lainnya</option>
            </select>
            <input
              required
              type="number"
              min="0"
              placeholder="Gaji pokok"
              value={contract.baseSalary}
              onChange={(event) =>
                setContract({ ...contract, baseSalary: event.target.value })
              }
              className="input"
            />
            <input
              required
              type="date"
              aria-label="Tanggal mulai kontrak"
              value={contract.startDate}
              onChange={(event) =>
                setContract({ ...contract, startDate: event.target.value })
              }
              className="input"
            />
            <input
              type="date"
              aria-label="Tanggal selesai kontrak"
              value={contract.endDate}
              onChange={(event) =>
                setContract({ ...contract, endDate: event.target.value })
              }
              className="input"
            />
            <Button disabled={busy} className="sm:col-span-2">
              Tambah Kontrak
            </Button>
          </form>
        </CardContent>
      </Card>
      <HistoryGrid data={data} />
      <Dialog open={editOpen} onOpenChange={(open) => { if (!busy) setEditOpen(open); }}>
        <DialogContent className="max-w-2xl" showClose={!busy} aria-busy={busy}>
          <DialogTitle>Edit Data Karyawan</DialogTitle>
          <DialogDescription>
            Perubahan sensitif dan mode presensi memerlukan alasan serta dicatat
            dalam audit.
          </DialogDescription>
          <form onSubmit={saveEdit} className="mt-5 grid gap-3 sm:grid-cols-2">
            {(
              [
                "name",
                "employeeNumber",
                "nik",
                "email",
                "phone",
                "jobTitle",
              ] as const
            ).map((key) => (
              <label key={key} className="text-sm">
                {
                  {
                    name: "Nama",
                    employeeNumber: "NIP",
                    nik: "NIK",
                    email: "Email",
                    phone: "Telepon",
                    jobTitle: "Jabatan",
                  }[key]
                }
                <input
                  required={key === "name"}
                  type={key === "email" ? "email" : "text"}
                  value={form[key]}
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.value })
                  }
                  className="input mt-1 w-full"
                />
              </label>
            ))}
            <label className="text-sm">
              Mode presensi
              <select
                value={form.attendanceMode}
                onChange={(event) =>
                  setForm({ ...form, attendanceMode: event.target.value })
                }
                className="input mt-1 w-full"
              >
                <option value="GEOFENCE">GEOFENCE — lokasi tetap</option>
                <option value="MOBILE">MOBILE — GPS tanpa radius tetap</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Alamat
              <textarea
                rows={3}
                value={form.address}
                onChange={(event) =>
                  setForm({ ...form, address: event.target.value })
                }
                className="input mt-1 w-full"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Alasan perubahan
              <input
                required
                minLength={3}
                value={form.reason}
                onChange={(event) =>
                  setForm({ ...form, reason: event.target.value })
                }
                className="input mt-1 w-full"
              />
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditOpen(false)}
              >
                Batal
              </Button>
              <Button disabled={busy}>
                {busy ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!action} onOpenChange={(open) => !open && !busy && setAction(null)}>
        <DialogContent showClose={!busy} aria-busy={busy}>
          <DialogTitle>
            {action === "delete"
              ? "Hapus Aman Karyawan"
              : action === "reactivate"
                ? "Aktifkan Karyawan"
                : "Nonaktifkan Karyawan"}
          </DialogTitle>
          <DialogDescription>
            {action === "delete"
              ? "Penghapusan akan ditolak jika terdapat akun, audit, atau riwayat terlindungi. Tidak ada force delete."
              : "Status akan diperbarui melalui lifecycle guard backend."}
          </DialogDescription>
          <label className="mt-5 block text-sm">
            Alasan tindakan
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="input mt-1 w-full"
            />
          </label>
          <Button
            variant={action === "delete" ? "danger" : "primary"}
            disabled={busy || reason.trim().length < 3}
            onClick={runLifecycle}
            className="mt-4 w-full"
          >
            Konfirmasi
          </Button>
        </DialogContent>
      </Dialog>
    </DossierPage>
  );
}

function Identity({
  profile,
  eyebrow,
}: {
  profile: Record<string, any>;
  eyebrow: string;
}) {
  return (
    <ContextBand title={profile.name} description={`${profile.jobTitle ?? "Karyawan"} · ${profile.placements?.[0]?.location?.name ?? "Belum ditempatkan"}`} meta={<><span>{eyebrow}</span><Badge className="border-white/15 bg-white/10 text-white">{label(profile.employmentType)}</Badge><StatusBadge status={String(profile.status ?? '-')} label={label(profile.status)} className="border-white/15 bg-white/10 text-white" /></>} actions={<EmployeeAvatar name={profile.name ?? "Karyawan"} photoUrl={profile.photoUrl} size="lg" className="size-20 border-white/20" />} />
  );
}
function label(value: unknown) {
  return value ? String(value).replaceAll("_", " ") : "-";
}
function InfoCard({
  title,
  items,
}: {
  title: string;
  items: [string, unknown][];
}) {
  return (
    <WorkSheet title={title}>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map(([name, value]) => (
          <div key={name}>
             <p className="text-caption font-semibold uppercase tracking-wider text-muted">
              {name}
            </p>
             <p className="mt-1 break-words text-body text-foreground">
              {value === null || value === undefined || value === ""
                ? "-"
                : String(value)}
            </p>
          </div>
        ))}
      </div>
    </WorkSheet>
  );
}
function PlacementCard({ placements }: { placements?: any[] }) {
  return (
    <WorkSheet id="placement" title="Penempatan">
        {placements?.length ? (
          <div className="space-y-2">
            {placements.map((item) => (
              <div
                key={item.id}
                className="flex gap-3 rounded-xl bg-slate-50 p-3"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-brand" />
                <div>
                  <p className="font-semibold text-navy">
                    {item.location?.name ?? "Lokasi kerja"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDate(item.startDate)} -{" "}
                    {item.endDate ? formatDate(item.endDate) : "Sekarang"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Belum ada penempatan.</p>
        )}
    </WorkSheet>
  );
}
function HistoryGrid({ data }: { data: ProfileData }) {
  const sections = [
    {
      title: "Presensi",
      icon: CalendarDays,
      rows: data.recentAttendance,
      render: (r: any) =>
        `${formatDate(r.date)} · ${formatTime(r.checkInAt)} - ${formatTime(r.checkOutAt)} · ${r.location?.name ?? "-"}`,
    },
    {
      title: "Cuti & Izin",
      icon: FileText,
      rows: data.leaveRequests,
      render: (r: any) => `${label(r.type)} · ${label(r.status)}`,
    },
    {
      title: "Lembur",
      icon: Clock3,
      rows: data.overtimeRequests,
      render: (r: any) => `${formatDate(r.date)} · ${label(r.status)}`,
    },
    {
      title: "Ketidakhadiran",
      icon: ShieldAlert,
      rows: data.absenceCases,
      render: (r: any) => `${formatDate(r.date)} · ${label(r.status)}`,
    },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {sections.map(({ icon: Icon, ...section }) => (
        <WorkSheet key={section.title} title={<span className="flex items-center gap-2"><Icon className="size-5 text-brand" />{section.title}</span>}>
            {section.rows?.length ? (
              <div className="divide-y">
                {section.rows.slice(0, 5).map((row: any) => (
                  <p
                    key={row.id}
                    className="py-3 text-sm text-slate-600 first:pt-0"
                  >
                    {section.render(row)}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Belum ada data.</p>
            )}
        </WorkSheet>
      ))}
    </div>
  );
}
