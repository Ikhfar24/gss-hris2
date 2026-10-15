"use client";

import { useSession } from "@/components/providers/SessionProvider";
import { employmentTypeLabel } from "@/lib/employment";
import { cn } from "@/lib/utils";
import { CurrentUserAvatar } from "./CurrentUserIdentity";

export function MobileIdentityHeader({ className }: { className?: string }) {
  const { session } = useSession();
  const employee = session.employee;
  if (!employee) return null;

  return (
    <header
      className={cn(
        "flex min-w-0 items-center justify-between gap-4 px-1 py-1",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-page-title text-brand">
          Halo, {employee.name.split(/\s+/)[0]}
        </h1>
        <p className="mt-0.5 truncate text-body text-muted">
          {employee.jobTitle || employmentTypeLabel(employee.employmentType)}
        </p>
      </div>
      <CurrentUserAvatar
        size="lg"
        className="size-16 border-paper bg-brand text-white sm:size-[4.5rem]"
      />
    </header>
  );
}
