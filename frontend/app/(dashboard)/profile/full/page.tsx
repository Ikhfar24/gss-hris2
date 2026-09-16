'use client';

import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import { useSession } from '@/components/providers/SessionProvider';
import { EmployeeFullProfile } from '@/components/employee/EmployeeFullProfile';
import { ErrorState } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';

interface Employee360 {
  profile: Record<string, any>;
  recentAttendance?: Record<string, any>[];
  leaveRequests?: Record<string, any>[];
  temporaryAssignments?: Record<string, any>[];
  absenceCases?: Record<string, any>[];
  overtimeRequests?: Record<string, any>[];
  profileChangeHistory?: Record<string, any>[];
}

export default function MyFullProfilePage() {
  const { session } = useSession();
  const [data, setData] = useState<Employee360 | null>(null);
  const [error, setError] = useState(false);
  async function load() { setError(false); try { setData(await apiFetch<Employee360>('/employees/me/360')); } catch (reason) { setError(reason instanceof ApiError || reason instanceof Error); } }
  useEffect(() => { void load(); }, []);
  if (error) return <ErrorState retry={load} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;
  return <EmployeeFullProfile data={data} canRequestChange={session.role === 'KARYAWAN'} />;
}
