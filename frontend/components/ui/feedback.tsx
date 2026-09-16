import { AlertCircle, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Alert({ title, children, variant = 'info', className }: { title?: string; children: React.ReactNode; variant?: 'info' | 'success' | 'warning' | 'danger'; className?: string }) {
  const styles = { info: 'border-info-border bg-info-surface text-info', success: 'border-success-border bg-success-surface text-success', warning: 'border-warning-border bg-warning-surface text-warning', danger: 'border-danger-border bg-danger-surface text-danger' };
  const liveProps = variant === 'danger' ? { role: 'alert' as const } : variant === 'success' ? { role: 'status' as const, 'aria-live': 'polite' as const } : {};
  return <div {...liveProps} className={cn('flex min-w-0 gap-3 rounded-xl border p-4 text-sm', styles[variant], className)}><AlertCircle className="mt-0.5 size-4 shrink-0" /><div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{title && <p className="font-semibold">{title}</p>}<div className={title ? 'mt-1' : ''}>{children}</div></div></div>;
}
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface p-8 text-center"><span className="mb-3 rounded-full bg-surface-subtle p-3"><Inbox className="size-5 text-muted" /></span><h3 className="font-semibold text-brand">{title}</h3>{description && <p className="mt-1 max-w-md text-body text-muted">{description}</p>}{action && <div className="mt-4">{action}</div>}</div>;
}
export function ErrorState({ retry }: { retry?: () => void }) { return <div className="mx-auto flex min-h-[60vh] max-w-md items-center" role="alert"><div className="w-full text-center"><AlertCircle className="mx-auto size-8 text-danger" /><h2 className="mt-3 text-section-title text-brand">Halaman tidak dapat dimuat</h2><p className="mt-1 text-body text-muted">Terjadi kendala sementara. Silakan coba kembali.</p>{retry && <Button className="mt-4" onClick={retry}>Coba lagi</Button>}</div></div>; }
export function LoadingState({ label = 'Memuat data...', className, children }: { label?: string; className?: string; children: React.ReactNode }) { return <div role="status" aria-label={label} className={className}><span className="sr-only">{label}</span>{children}</div>; }
