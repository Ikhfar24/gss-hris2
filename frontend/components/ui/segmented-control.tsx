import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedControlOption<T>[];
  "aria-label": string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  ...props
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      className={cn(
        "inline-flex max-w-full overscroll-x-contain overflow-x-auto rounded-lg border border-border bg-surface-subtle p-1",
        className,
      )}
      {...props}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 sm:min-h-9",
              selected
                ? "bg-paper text-brand shadow-control"
                : "text-muted hover:bg-paper/70 hover:text-brand",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
