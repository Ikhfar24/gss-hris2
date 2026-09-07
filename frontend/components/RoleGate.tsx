'use client';

import { ReactNode } from 'react';

/**
 * Client-side visibility helper only (hide nav items, buttons, etc).
 * Not a security boundary — the backend RolesGuard is what actually
 * enforces permission, per PRD section 19 ("Authorization di backend").
 */
export default function RoleGate({
  allow,
  role,
  children,
}: {
  allow: string[];
  role?: string | null;
  children: ReactNode;
}) {
  if (!role || !allow.includes(role)) return null;
  return <>{children}</>;
}
