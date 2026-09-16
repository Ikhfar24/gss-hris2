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
  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}</div>;
  if (error) return <ErrorState retry={load} />;
  return <DossierPage className="max-w-5xl"><ContextBand title="Pusat Persetujuan" description="Tinjau detail pada workflow sumber sebelum mengonfirmasi keputusan." meta={<span>DIREKTUR · KEPUTUSAN</span>} /><div className="mb-5 flex gap-3 border-l-4 border-accent bg-paper p-4 shadow-card"><FileCheck2 className="size-5 shrink-0 text-brand" /><p className="text-body text-muted">Pusat ini tidak menciptakan tahap baru. Daftar berasal dari workflow Direktur yang sudah ada.</p></div><WorkSheet title="Antrean Keputusan" description="Buka workflow sumber untuk memeriksa detail dan bukti.">{items.length ? <div className="divide-y divide-border">{items.map((item) => <Link key={item.key} href={item.href} className="group flex min-h-16 min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0"><AlertTriangle className="size-4 shrink-0 text-warning" /><span className="min-w-0 flex-1 break-words text-body font-semibold text-foreground [overflow-wrap:anywhere]">{item.label}</span><span className="text-xl font-bold tabular-nums text-navy">{item.count}</span><ArrowRight className="size-4 shrink-0 text-muted" /></Link>)}</div> : <EmptyState title="Tidak ada keputusan tertunda" description="Semua tahap Direktur sudah tertangani." />}</WorkSheet></DossierPage>;
}
