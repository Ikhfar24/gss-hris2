"use client";

import { useState } from "react";
import { useBranding } from "./providers/BrandingProvider";
import { cn } from "@/lib/utils";

export function AppLogo({
  compact = false,
  inverse = false,
  className,
}: {
  compact?: boolean;
  inverse?: boolean;
  className?: string;
}) {
  const branding = useBranding();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = branding.logoUrl && failedUrl !== branding.logoUrl;
  const initials = branding.appName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      {showImage ? (
        <span
          className={cn(
            "relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border",
            inverse ? "border-white/15 bg-white" : "border-border bg-paper",
          )}
        >
          <img
            src={branding.logoUrl!}
            alt={`${branding.companyName} logo`}
            referrerPolicy="no-referrer"
            onError={() => setFailedUrl(branding.logoUrl)}
            className="size-8 object-contain"
          />
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-1 bg-accent"
          />
        </span>
      ) : (
        <span
          className={cn(
            "relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border text-xs font-extrabold tracking-wider",
            inverse
              ? "border-white/15 bg-white/10 text-white"
              : "border-brand bg-brand text-white",
          )}
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-1 bg-accent"
          />
          {initials}
        </span>
      )}
      {!compact && (
        <span
          className={cn(
            "truncate text-[15px] font-bold tracking-tight",
            inverse ? "text-white" : "text-navy",
          )}
        >
          {branding.appName}
        </span>
      )}
    </div>
  );
}
