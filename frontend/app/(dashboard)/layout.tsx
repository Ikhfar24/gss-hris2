import { AppShell, AppShellSkeleton } from '@/components/AppShell';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { AccountGate } from '@/components/providers/AccountGate';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider fallback={<AppShellSkeleton />}><AccountGate><AppShell>{children}</AppShell></AccountGate></SessionProvider>;
}
