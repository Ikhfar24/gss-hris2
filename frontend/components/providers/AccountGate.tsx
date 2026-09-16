'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from './SessionProvider';
import { AppShellSkeleton } from '../AppShell';

export function AccountGate({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const blocked = session.mustChangePassword && pathname !== '/account';

  useEffect(() => {
    if (blocked) router.replace('/account');
  }, [blocked, router]);

  return blocked ? <AppShellSkeleton /> : <>{children}</>;
}
