import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex max-w-full min-w-0 items-center whitespace-normal break-words rounded-full border px-2.5 py-0.5 text-left text-xs font-semibold leading-5 [overflow-wrap:anywhere] [&_svg]:shrink-0', {
  variants: { variant: { neutral: 'border-border bg-surface-subtle text-muted', success: 'border-success-border bg-success-surface text-success', warning: 'border-warning-border bg-warning-surface text-warning', danger: 'border-danger-border bg-danger-surface text-danger', info: 'border-info-border bg-info-surface text-info' } },
  defaultVariants: { variant: 'neutral' },
});
export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) { return <span className={cn(badgeVariants({ variant }), className)} {...props} />; }

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  ACTIVE: 'success', APPROVED: 'success', COMPLETED: 'success', EXCUSED: 'success', FINALIZED: 'success', HADIR: 'success', PAID: 'success', PRESENT: 'success', RESOLVED: 'success', VALID: 'success', AKTIF: 'success', DISETUJUI: 'success', SELESAI: 'success',
  DRAFT: 'warning', FOLLOW_UP: 'warning', IN_REVIEW: 'warning', NEEDS_REVIEW: 'warning', OPEN: 'warning', PENDING: 'warning', PENDING_COORDINATOR: 'warning', PENDING_DIRECTOR: 'warning', PENDING_EXPLANATION: 'warning', PENDING_HR: 'warning', REVIEWED: 'warning', SUBMITTED: 'warning', 'MENUNGGU REVIEW': 'warning',
  ABSENT: 'danger', ALPHA: 'danger', CANCELLED: 'danger', FORGOTTEN_CHECKOUT: 'danger', INACTIVE: 'danger', INVALID: 'danger', LATE: 'danger', REJECTED: 'danger', DIBATALKAN: 'danger', DITOLAK: 'danger', NONAKTIF: 'danger', TERLAMBAT: 'danger',
  GEOFENCE: 'info', MOBILE: 'info', NOT_APPLICABLE: 'info', ON_LEAVE: 'info', SCHEDULED: 'info',
};

export function StatusBadge({ status, label, variant, className }: { status: string; label?: string; variant?: BadgeVariant; className?: string }) {
  const normalized = status.trim().toUpperCase();
  return <Badge variant={variant ?? STATUS_VARIANTS[normalized] ?? 'neutral'} className={cn('w-fit shrink-0 whitespace-nowrap break-normal [overflow-wrap:normal]', className)}>{label ?? status.replaceAll('_', ' ')}</Badge>;
}
