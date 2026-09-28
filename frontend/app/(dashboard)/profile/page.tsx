"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  FileText,
  Fingerprint,
  History,
  MapPin,
} from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";
import { CurrentUserAvatar } from "@/components/employee/CurrentUserIdentity";
import { ContextBand, DossierPage } from "@/components/ui/dossier";
import { Alert } from "@/components/ui/feedback";
import { employmentTypeLabel } from "@/lib/employment";
import { canAttend } from "@/lib/navigation";

export default function EmployeeProfilePage() {
  const { session } = useSession();
  const employee = session.employee;
  if (!employee)
    return (
      <DossierPage className="max-w-3xl">
        <ContextBand
          title={session.email}
          description="Akun ini tidak terhubung ke identitas Employee."
          meta={<span>AKUN</span>}
        />
        <Alert variant="warning" title="Layanan personal tidak tersedia">
          Presensi dan layanan personal memerlukan identitas karyawan yang
          terhubung.
        </Alert>
      </DossierPage>
    );

  const isStaffOffice = employee.employmentType === "STAFF_OFFICE";
  const shortcuts = [
    {
      title: "Profil Lengkap",
      description: "Data personal, pekerjaan, dan riwayat",
      href: "/profile/full",
      icon: FileText,
    },
    {
      title: "Slip Gaji Saya",
      description: "Lihat slip gaji final yang tersedia",
      href: "/payroll?view=mine",
      icon: FileText,
    },
    ...(!isStaffOffice
      ? [
          {
            title: "Lokasi Kerja",
            description: "Lihat riwayat lokasi kerja",
            href: "/profile/full#placement",
            icon: History,
          },
        ]
      : []),
    ...(canAttend(session)
      ? [
          {
            title: "Presensi Saya",
            description: "Check-in, check-out, dan bukti lokasi",
            href: "/attendance?view=mine",
            icon: Fingerprint,
          },
        ]
      : []),
    ...(["KOORDINATOR", "ADMIN_HR", "KEUANGAN", "MARKETING"].includes(
      session.role,
    )
      ? [
          {
            title: "Cuti & Izin Saya",
            description: "Akses layanan mandiri karyawan",
            href: "/leave-requests?view=mine",
            icon: CalendarDays,
          },
        ]
      : []),
  ];

  return (
    <DossierPage className="mx-auto max-w-5xl space-y-4">
      <header className="flex min-w-0 items-center gap-4 rounded-xl bg-brand p-4 text-white shadow-card sm:p-5">
        <CurrentUserAvatar
          size="lg"
          className="size-16 border-white/20 bg-white/10 text-white"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{employee.name}</h1>
          <p className="mt-0.5 truncate text-sm text-white/75">
            {employee.jobTitle || employmentTypeLabel(employee.employmentType)}
          </p>
          <p className="mt-2 flex min-w-0 items-center gap-1.5 text-caption text-white/70">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">
              {employee.activePlacementName ??
                (isStaffOffice
                  ? "Lokasi kerja belum ditetapkan"
                  : "Penempatan belum tersedia")}
            </span>
          </p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-caption font-semibold">
          {employee.status === "ACTIVE" ? "Aktif" : employee.status}
        </span>
      </header>

      <section aria-labelledby="profile-services-title">
        <div className="mb-2 px-1">
          <h2 id="profile-services-title" className="text-section-title text-brand">
            Profil & Layanan
          </h2>
          <p className="mt-0.5 text-caption text-muted">
            Informasi personal dan layanan akun Anda.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {shortcuts.map(({ icon: Icon, ...item }) => (
            <Link
              key={item.title}
              href={item.href}
              className="group flex min-h-32 min-w-0 flex-col items-start gap-3 rounded-xl bg-paper p-3.5 shadow-card transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:min-h-24 sm:flex-row sm:items-center"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-brand">{item.title}</span>
                <span className="mt-0.5 block break-words text-caption text-muted [overflow-wrap:anywhere]">
                  {item.description}
                </span>
              </span>
              <ArrowUpRight className="absolute size-0 text-muted sm:static sm:size-4" />
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 rounded-xl bg-paper p-4 shadow-card sm:grid-cols-3">
        <ProfileFact label="Status" value={employee.status === "ACTIVE" ? "Aktif" : employee.status} />
        <ProfileFact label="Jenis Tenaga" value={employmentTypeLabel(employee.employmentType)} />
        <ProfileFact label="Peran Akun" value={session.role.replaceAll("_", " ")} />
      </section>
      {session.role === "KARYAWAN" && (
        <Alert title="Perubahan data profil">
          Untuk memperbarui data personal, gunakan Pengajuan Perubahan Profil.
          Foto profil master hanya dapat dikelola oleh Admin HR.{" "}
          <Link
            href="/profile-change-requests"
            className="font-semibold underline"
          >
            Ajukan perubahan
          </Link>
        </Alert>
      )}
    </DossierPage>
  );
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-subtle px-3 py-2.5">
      <p className="text-caption font-semibold text-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-brand [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}
