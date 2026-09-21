import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneStyles: Record<Tone, string> = {
  neutral: "text-navy",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

export function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  detail?: string;
  tone?: Tone;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-paper px-4 py-3 shadow-control">
      <p className="text-caption font-semibold text-muted">{label}</p>
      <p
        className={cn(
          "mt-1.5 break-words text-[1.625rem] font-bold leading-none tabular-nums [overflow-wrap:anywhere]",
          toneStyles[tone],
        )}
      >
        {value}
      </p>
      {detail && (
        <p className="mt-2 break-words text-caption text-muted [overflow-wrap:anywhere]">
          {detail}
        </p>
      )}
    </div>
  );
}

export function DistributionRow({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-semibold tabular-nums text-brand">
          {value}{" "}
          <span className="font-normal text-muted">({percentage}%)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
