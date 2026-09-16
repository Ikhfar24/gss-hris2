'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import type { AttendanceRecord } from '@/lib/attendance';
import { AttendanceDetailView } from '@/components/attendance/AttendanceDetailView';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';

export default function AttendanceHistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [error, setError] = useState(false);
  async function load() { setError(false); try { setAttendance(await apiFetch<AttendanceRecord>(`/attendance/${id}`)); } catch (reason) { setError(reason instanceof ApiError || reason instanceof Error); } }
  useEffect(() => { void load(); }, [id]);
  if (error) return <ErrorState retry={load} />;
  if (!attendance) return <div className="space-y-4"><Skeleton className="h-11 w-44" /><Skeleton className="h-52 rounded-2xl" /><div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-96 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div></div>;
  return <div className="mx-auto max-w-6xl"><Button asChild variant="ghost" className="mb-3 -ml-3"><Link href="/attendance/history"><ArrowLeft className="size-4" />Kembali ke Riwayat</Link></Button><AttendanceDetailView attendance={attendance} /></div>;
}
