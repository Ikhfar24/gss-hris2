'use client';

import { useSession } from '@/components/providers/SessionProvider';
import { EmployeeHome } from '@/components/employee/EmployeeHome';
import { ManagementHome } from '@/components/management/ManagementHome';
import { ExecutiveHome, FinanceHome, SystemAdminHome } from '@/components/phase4/RoleHomes';

export default function DashboardPage() {
  const { session } = useSession();
  if (session.role === 'KARYAWAN') return <EmployeeHome />;
  if (session.role === 'MARKETING') return <EmployeeHome capabilities="marketing" />;
  if (session.role === 'KOORDINATOR' || session.role === 'ADMIN_HR') return <ManagementHome role={session.role} />;
  if (session.role === 'KEUANGAN') return <FinanceHome />;
  if (session.role === 'DIREKTUR' || session.role === 'KOMISARIS') return <ExecutiveHome role={session.role} />;
  return <SystemAdminHome />;
}
