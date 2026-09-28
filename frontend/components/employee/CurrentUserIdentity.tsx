"use client";

import type { ComponentProps } from "react";
import type { Session } from "@/lib/session";
import { useSession } from "@/components/providers/SessionProvider";
import { EmployeeAvatar } from "./EmployeeAvatar";

function resolveCurrentUserIdentity(session: Session) {
  return {
    name: session.employee?.name ?? session.email,
    photoUrl: session.employee?.photoUrl ?? null,
  };
}

export function useCurrentUserIdentity() {
  const { session } = useSession();
  return resolveCurrentUserIdentity(session);
}

export function CurrentUserAvatar(
  props: Omit<ComponentProps<typeof EmployeeAvatar>, "name" | "photoUrl">,
) {
  const identity = useCurrentUserIdentity();
  return (
    <EmployeeAvatar
      {...props}
      name={identity.name}
      photoUrl={identity.photoUrl}
    />
  );
}
