"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  FileText,
  Fingerprint,
  History,
} from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";
import { EmployeeIdentityBand } from "@/components/employee/EmployeeIdentityBand";
import { ContextBand, DossierPage, WorkSheet } from "@/components/ui/dossier";
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
    <DossierPage className="max-w-5xl space-y-5">
      <EmployeeIdentityBand
        name={employee.name}
        jobTitle={employee.jobTitle}
        photoUrl={employee.photoUrl}
        employmentType={employmentTypeLabel(employee.employmentType)}
        status={employee.status}
        placement={employee.activePlacementName ?? (isStaffOffice ? "Lokasi kerja belum ditetapkan" : "Penempatan belum tersedia")}
      />
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <WorkSheet
          title="Dokumen & Layanan"
          description="Akses informasi personal yang tersedia untuk akun Anda."
        >
          <div className="divide-y divide-border">
            {shortcuts.map(({ icon: Icon, ...item }, index) => (
              <Link
                key={item.title}
                href={item.href}
                className="group flex min-h-20 min-w-0 items-center gap-4 py-3.5 first:pt-0 last:pb-0"
              >
                <span className="w-7 shrink-0 text-caption font-bold tabular-nums text-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-brand">
                    {item.title}
                  </span>
                  <span className="block break-words text-caption text-muted [overflow-wrap:anywhere]">
                    {item.description}
                  </span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" />
              </Link>
            ))}
          </div>
        </WorkSheet>
        <WorkSheet title="Konteks Kerja" className="self-start">
          <dl className="space-y-4">
            <div>
              <dt className="dossier-label">Status</dt>
              <dd className="mt-1 font-semibold text-brand">
                {employee.status === "ACTIVE" ? "Aktif" : employee.status}
              </dd>
            </div>
            <div className="border-t border-border pt-4">
              <dt className="dossier-label">Jenis Tenaga</dt>
              <dd className="mt-1 font-semibold text-brand">
                {employmentTypeLabel(employee.employmentType)}
              </dd>
            </div>
            <div className="border-t border-border pt-4">
              <dt className="dossier-label">Penempatan / Lokasi</dt>
              <dd className="mt-1 break-words font-semibold text-brand [overflow-wrap:anywhere]">
                {employee.activePlacementName ??
                  (isStaffOffice
                    ? "Lokasi kerja belum ditetapkan"
                    : "Penempatan belum tersedia")}
              </dd>
            </div>
          </dl>
        </WorkSheet>
      </div>
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
