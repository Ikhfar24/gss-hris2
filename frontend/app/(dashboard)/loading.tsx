import { Skeleton } from '@/components/ui/skeleton';
import { LoadingState } from '@/components/ui/feedback';

export default function DashboardLoading() {
  return <LoadingState label="Memuat halaman"><Skeleton className="h-8 w-56" /><Skeleton className="mt-3 h-4 w-80 max-w-full" /><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32" />)}</div></LoadingState>;
}
