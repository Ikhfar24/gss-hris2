import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
export default function NotFound() { return <main className="mx-auto flex min-h-dvh max-w-xl items-center p-6"><div className="w-full"><EmptyState title="Halaman tidak ditemukan" description="Alamat yang Anda buka tidak tersedia atau telah dipindahkan." action={<Button asChild><Link href="/dashboard">Kembali ke dashboard</Link></Button>} /></div></main>; }
