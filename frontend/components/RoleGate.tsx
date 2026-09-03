'use client';

import { ReactNode } from 'react';
import { getUser } from '@/lib/auth';

/**
 * Client-side visibility helper only (hide nav items, buttons, etc).
 * Not a security boundary — the backend RolesGuard is what actually
 * enforces permission, per PRD section 19 ("Authorization di backend").
 */
export default function RoleGate({
  allow,
  children,
}: {
  allow: string[];
  children: ReactNode;
}) {
  const user = getUser();
  if (!user || !allow.includes(user.role)) return null;
  return <>{children}</>;
}
