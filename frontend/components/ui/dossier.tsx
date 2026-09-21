import * as React from "react";
import { cn } from "@/lib/utils";

export function DossierPage({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1600px] min-w-0", className)}
      {...props}
    />
  );
}

export function ContextBand({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative mb-4 overflow-hidden rounded-xl border border-border bg-paper px-4 py-4 shadow-card sm:px-5",
        className,
      )}
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="break-words text-page-title text-brand [overflow-wrap:anywhere]">
            {title}
          </h1>
          {description && (
            <div className="mt-1 max-w-3xl text-body text-muted">
              {description}
            </div>
          )}
          {meta && (
            <div className="mt-2 flex flex-wrap gap-2 text-caption text-muted">
              {meta}
            </div>
          )}
        </div>
        {actions && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

export function WorkSheet({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: Omit<React.HTMLAttributes<HTMLElement>, "title"> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section
      className={cn("min-w-0 rounded-xl border border-border bg-paper shadow-card", className)}
      {...props}
    >
      {(title || description || actions) && (
        <div className="flex flex-col justify-between gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            {title && (
              <h2 className="break-words text-section-title text-brand [overflow-wrap:anywhere]">
                {title}
              </h2>
            )}
            {description && (
              <div className="mt-1 text-body text-muted">{description}</div>
            )}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className="min-w-0 p-4">{children}</div>
    </section>
  );
}

export function MetricStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function MobileRecord({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <article
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border border-border bg-paper shadow-control",
        className,
      )}
      {...props}
    >
      {children}
    </article>
  );
}

export function RecordHeader({
  title,
  detail,
  status,
  className,
}: {
  title: React.ReactNode;
  detail?: React.ReactNode;
  status?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-3 border-b border-border px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="break-words font-semibold text-brand [overflow-wrap:anywhere]">
          {title}
        </div>
        {detail && (
          <div className="mt-1 break-words text-caption text-muted [overflow-wrap:anywhere]">
            {detail}
          </div>
        )}
      </div>
      {status && <div className="shrink-0">{status}</div>}
    </div>
  );
}

export function RecordBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 px-4 py-4", className)} {...props} />;
}

export function RecordActions({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-2 border-t border-border bg-surface-subtle px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

export function DataRegion({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-paper shadow-control [&_table]:w-full [&_thead]:bg-surface-subtle [&_thead]:text-left [&_thead]:text-caption [&_thead]:font-semibold [&_thead]:text-muted [&_th]:whitespace-nowrap [&_th]:px-4 [&_th]:py-2.5 [&_tbody_tr]:border-b [&_tbody_tr]:border-border [&_tbody_tr]:transition-colors [&_tbody_tr:last-child]:border-b-0 [&_tbody_tr:hover]:bg-surface-subtle/75 [&_td]:px-4 [&_td]:py-2.5",
        className,
      )}
      {...props}
    />
  );
}

export function FilterRail({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mb-4 flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-paper px-4 py-3 shadow-control sm:flex-row sm:flex-wrap sm:items-end [&_label]:text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function IndexTabs({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "max-w-full overflow-x-auto overscroll-x-contain border-b border-border",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
