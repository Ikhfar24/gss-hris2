"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  FileText,
  LogOut,
} from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";
import { ContextBand, DossierPage, WorkSheet } from "@/components/ui/dossier";
import { Alert } from "@/components/ui/feedback";

const services = [
  {
    title: "Cuti",
    description: "Ajukan waktu cuti sesuai hak dan alur persetujuan.",
    href: "/leave-requests?new=CUTI",
    icon: CalendarDays,
    color: "bg-info-surface text-info",
  },
  {
    title: "Izin",
    description: "Ajukan sakit, izin mendadak, atau izin lainnya.",
    href: "/leave-requests?new=IZIN_LAIN",
    icon: FileText,
    color: "bg-warning-surface text-warning",
  },
  {
    title: "Lembur",
    description: "Catat rencana waktu dan alasan pekerjaan lembur.",
    href: "/overtime-requests?new=1",
    icon: Clock3,
    color: "bg-brand/10 text-brand",
  },
  {
    title: "Resign",
    description: "Ajukan pengunduran diri melalui alur resmi.",
    href: "/leave-requests?new=RESIGN",
    icon: LogOut,
    color: "bg-danger-surface text-danger",
  },
];

export default function RequestsPage() {
  const { session } = useSession();
  if (session.role !== "KARYAWAN")
    return (
      <Alert variant="warning" title="Halaman khusus karyawan">
        Gunakan modul operasional sesuai peran Anda melalui menu utama.
      </Alert>
    );
  return (
    <DossierPage className="max-w-5xl">
      <ContextBand
        title="Pengajuan"
        description="Buka layanan mandiri atau lanjutkan pemantauan permohonan Anda."
        meta={<span>LAYANAN KARYAWAN</span>}
      />
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <WorkSheet
          title="Buat Pengajuan"
          description="Pilih jenis layanan untuk memulai."
        >
          <div className="divide-y divide-border">
            {services.map(({ icon: Icon, ...service }, index) => (
              <Link
                key={service.title}
                href={service.href}
                className="group flex min-h-24 min-w-0 items-center gap-4 py-4 first:pt-0 last:pb-0"
              >
                <span className="w-7 shrink-0 text-caption font-bold tabular-nums text-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-lg ${service.color}`}
                >
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-brand">
                    {service.title}
                  </span>
                  <span className="mt-1 block break-words text-body leading-relaxed text-muted [overflow-wrap:anywhere]">
                    {service.description}
                  </span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" />
              </Link>
            ))}
          </div>
        </WorkSheet>
        <WorkSheet
          title="Riwayat"
          description="Pantau permohonan yang sudah dikirim."
          className="self-start"
        >
          <p className="text-body leading-relaxed text-muted">
            Status, tahapan persetujuan, dan catatan permohonan tersedia di
            riwayat pengajuan.
          </p>
          <Link
            href="/leave-requests"
            className="mt-5 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand"
          >
            Lihat riwayat <ChevronRight className="size-4" />
          </Link>
        </WorkSheet>
      </div>
    </DossierPage>
  );
}
