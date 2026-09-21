import { MapPin } from 'lucide-react';
import { EmployeeAvatar } from '@/components/employee/EmployeeAvatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function EmployeeIdentityBand({ name, jobTitle, photoUrl, placement, employmentType, status, context, className }: { name: string; jobTitle?: string | null; photoUrl?: string | null; placement?: string | null; employmentType?: string | null; status?: string | null; context?: string; className?: string }) {
  return <header className={cn('relative mb-4 overflow-hidden rounded-xl border border-border bg-paper px-4 py-4 shadow-card sm:px-5', className)}>
    <div className="flex min-w-0 items-start justify-between gap-4 sm:items-center sm:gap-5">
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-page-title text-brand [overflow-wrap:anywhere]">{name}</h1>
        <p className="mt-1 break-words text-body font-medium text-foreground [overflow-wrap:anywhere]">{jobTitle ?? 'Karyawan'}</p>
        <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-2 text-caption text-muted">
          {context && <Badge variant="info">{context}</Badge>}
          {employmentType && <Badge>{employmentType}</Badge>}
          {status && <StatusBadge status={status} label={status === 'ACTIVE' ? 'Aktif' : status} />}
        </div>
        {placement && <p className="mt-2.5 flex min-w-0 items-start gap-1.5 break-words text-caption leading-5 text-muted [overflow-wrap:anywhere]"><MapPin className="mt-0.5 size-3.5 shrink-0 text-brand" /><span className="min-w-0">{placement}</span></p>}
      </div>
      <EmployeeAvatar name={name} photoUrl={photoUrl} size="lg" className="size-[5rem] border-border bg-brand text-white sm:size-20" />
    </div>
  </header>;
}
