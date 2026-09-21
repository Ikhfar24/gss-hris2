'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, FileCheck2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import { useSession } from '@/components/providers/SessionProvider';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { ContextBand, DossierPage, WorkSheet } from '@/components/ui/dossier';
import { Skeleton } from '@/components/ui/skeleton';

interface Attention { key: string; label: string; count: number; href: string }

export default function DirectorApprovalCenter() {
  const { session } = useSession();
  const [items, setItems] = useState<Attention[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  async function load() { setLoading(true); setError(false); try { setItems((await apiFetch<Attention[]>('/dashboard/attention')).filter((item) => item.count > 0)); } catch (reason) { setError(reason instanceof ApiError || reason instanceof Error); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  if (session.role !== 'DIREKTUR') return <EmptyState title="Pusat persetujuan tidak tersedia" description="Hanya Direktur yang memiliki tahap keputusan ini." />;
  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)}</div>;
  if (error) return <ErrorState retry={load} />;
  return <DossierPage className="max-w-5xl space-y-5"><ContextBand className="mb-0 border border-border bg-paper px-4 py-4 text-foreground shadow-none sm:px-5 [&_h1]:text-brand [&_.text-white\/70]:text-muted [&_.text-white\/72]:text-muted" title="Pusat Persetujuan" description="Tinjau detail pada workflow sumber sebelum mengonfirmasi keputusan." meta={<span>DIREKTUR · KEPUTUSAN</span>} /><div className="flex gap-3 rounded-xl border border-border bg-warning-surface p-4"><FileCheck2 className="size-5 shrink-0 text-brand" /><p className="text-body text-muted">Pusat ini tidak menciptakan tahap baru. Daftar berasal dari workflow Direktur yang sudah ada.</p></div><WorkSheet className="border border-border shadow-none" title="Antrean Keputusan" description="Buka workflow sumber untuk memeriksa detail dan bukti.">{items.length ? <div className="divide-y divide-border">{items.map((item) => <Link key={item.key} href={item.href} className="group flex min-h-16 min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="grid size-10 shrink-0 place-items-center rounded-lg border border-warning-border bg-warning-surface"><AlertTriangle className="size-4 text-warning" /></span><span className="min-w-0 flex-1 break-words text-body font-semibold text-foreground [overflow-wrap:anywhere]">{item.label}</span><span className="min-w-8 text-right text-xl font-bold tabular-nums text-navy">{item.count}</span><ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" /></Link>)}</div> : <EmptyState title="Tidak ada keputusan tertunda" description="Semua tahap Direktur sudah tertangani." />}</WorkSheet></DossierPage>;
}
