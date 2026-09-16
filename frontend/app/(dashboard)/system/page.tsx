'use client';

import { ShieldCheck } from 'lucide-react';
import { useSession } from '@/components/providers/SessionProvider';
import { systemModules } from '@/components/phase4/RoleHomes';
import { EmptyState } from '@/components/ui/feedback';
import { ContextBand, DossierPage, WorkSheet } from '@/components/ui/dossier';
import Link from 'next/link';

export default function SystemHubPage() {
  const { session } = useSession();
  if (session.role !== 'SYSTEM_ADMIN') return <EmptyState title="Hub Sistem tidak tersedia" description="Halaman ini khusus System Admin." />;
  return <DossierPage className="space-y-5"><ContextBand title="Administrasi Sistem" description="Akun, akses, konfigurasi, dan master sistem yang sudah tersedia." meta={<span>SYSTEM AUTHORITY</span>} /><WorkSheet className="border-l-4 border-l-accent"><div className="flex gap-3"><ShieldCheck className="size-5 shrink-0 text-brand" /><p className="text-body text-muted">Role System Admin tidak otomatis memberikan kewenangan proses Payroll, persetujuan Direktur, atau pengelolaan foto profil HR.</p></div></WorkSheet><WorkSheet title="Indeks Modul" description="Administrasi akun, data master, dan konfigurasi operasional."><div className="divide-y divide-border">{systemModules.map(({ icon: Icon, ...module }) => <Link key={module.href} href={module.href} className="group flex min-h-20 min-w-0 items-center gap-4 py-3 first:pt-0 last:pb-0"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><Icon className="size-5" /></span><span className="min-w-0 flex-1"><span className="block break-words font-semibold text-navy [overflow-wrap:anywhere]">{module.title}</span><span className="mt-1 block break-words text-body leading-5 text-muted [overflow-wrap:anywhere]">{module.description}</span></span></Link>)}</div></WorkSheet></DossierPage>;
}
