import { Skeleton } from '@/components/ui/skeleton';
import { LoadingState } from '@/components/ui/feedback';
export default function Loading() { return <LoadingState label="Memuat halaman"><main className="mx-auto min-h-dvh max-w-5xl p-6"><Skeleton className="h-9 w-52" /><Skeleton className="mt-8 h-72 w-full rounded-2xl" /></main></LoadingState>; }
