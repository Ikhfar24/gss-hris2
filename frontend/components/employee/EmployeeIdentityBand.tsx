import { MapPin } from 'lucide-react';
import { EmployeeAvatar } from '@/components/employee/EmployeeAvatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function EmployeeIdentityBand({ name, jobTitle, photoUrl, placement, employmentType, status, context, className }: { name: string; jobTitle?: string | null; photoUrl?: string | null; placement?: string | null; employmentType?: string | null; status?: string | null; context?: string; className?: string }) {
  return <header className={cn('relative mb-6 overflow-hidden rounded-xl bg-binder px-5 py-5 text-white shadow-sheet sm:px-6 sm:py-6', className)}>
    <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent" />
    <div className="flex min-w-0 items-start justify-between gap-4 sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-page-title text-white [overflow-wrap:anywhere]">{name}</h1>
        <p className="mt-1 break-words text-body font-medium text-white/75 [overflow-wrap:anywhere]">{jobTitle ?? 'Karyawan'}</p>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-caption text-white/72">
          {context && <Badge className="border-white/15 bg-white/10 text-white">{context}</Badge>}
          {employmentType && <Badge className="border-white/15 bg-white/10 text-white">{employmentType}</Badge>}
          {status && <StatusBadge status={status} label={status === 'ACTIVE' ? 'Aktif' : status} className="border-white/15 bg-white/10 text-white" />}
        </div>
        {placement && <p className="mt-3 flex min-w-0 items-start gap-1.5 break-words text-caption leading-5 text-white/72 [overflow-wrap:anywhere]"><MapPin className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0">{placement}</span></p>}
      </div>
      <EmployeeAvatar name={name} photoUrl={photoUrl} size="lg" className="size-[5.5rem] border-white/25 bg-white/15 text-white sm:size-24" />
    </div>
  </header>;
}
