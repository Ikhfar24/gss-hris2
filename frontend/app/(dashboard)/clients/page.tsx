'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Building2, MapPin } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useSession } from '@/components/providers/SessionProvider';
import { XlsxImportPanel } from '@/components/XlsxImportPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { ContextBand, DossierPage } from '@/components/ui/dossier';

interface ClientRow {
  id: string;
  referenceCode: string;
  name: string;
  address?: string | null;
  contactPerson?: string | null;
  contactPhone?: string | null;
  isActive: boolean;
}

interface ClientLocation {
  id: string;
  referenceCode: string;
  name: string;
  address?: string | null;
  isActive: boolean;
}

interface ClientDetail extends ClientRow {
  locations: ClientLocation[];
}

export default function ClientsPage() {
  const { session } = useSession();
  const canManage = session.role === 'ADMIN_HR' || session.role === 'SYSTEM_ADMIN';
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ referenceCode: '', name: '', address: '', contactPerson: '', contactPhone: '' });

  async function load() {
    try {
      setClients(await apiFetch<ClientRow[]>('/clients', { token: getToken() }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat data client');
    }
  }

  useEffect(() => { void load(); }, []);

  async function openDetail(client: ClientRow) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setError(null);
    try {
      setDetail(await apiFetch<ClientDetail>(`/clients/${client.id}`, { token: getToken() }));
    } catch (err) {
      setDetailOpen(false);
      setError(err instanceof ApiError ? err.message : 'Gagal memuat detail client');
    } finally {
      setDetailLoading(false);
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/clients', { method: 'POST', token: getToken(), body: form });
      setForm({ referenceCode: '', name: '', address: '', contactPerson: '', contactPhone: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuat client');
    } finally {
      setSubmitting(false);
    }
  }

  return <DossierPage className="space-y-4">
    <ContextBand title="Client" description="Kelola identitas client dan lokasi kerja yang terhubung." meta={<span>REGISTRY · CLIENT & SITE</span>} actions={canManage && <Button onClick={() => setShowForm((value) => !value)}>{showForm ? 'Tutup Form' : 'Tambah Client'}</Button>} />
    {error && <Alert variant="danger" title="Data client tidak dapat diproses">{error}</Alert>}
    {canManage && <XlsxImportPanel resource="clients" title="Impor Client dari Excel" onCommitted={load} />}
    {canManage && showForm && <form onSubmit={onCreate} aria-busy={submitting} className="grid max-w-xl gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card"><ClientField label="Kode referensi" required value={form.referenceCode} onChange={(value) => setForm({ ...form, referenceCode: value })} placeholder="Contoh: CL-SINAR-ABADI" className="uppercase" description="Kode unik ini dipakai pada template import lokasi." /><ClientField label="Nama client" required value={form.name} onChange={(value) => setForm({ ...form, name: value })} /><ClientField label="Alamat" value={form.address} onChange={(value) => setForm({ ...form, address: value })} /><ClientField label="Contact person" value={form.contactPerson} onChange={(value) => setForm({ ...form, contactPerson: value })} /><ClientField label="Nomor telepon" value={form.contactPhone} onChange={(value) => setForm({ ...form, contactPhone: value })} inputMode="tel" /><Button disabled={submitting}>{submitting ? 'Menyimpan...' : 'Simpan Client'}</Button></form>}

    <div className="grid gap-3 md:hidden">{clients.map((client) => <article key={client.id} className="rounded-2xl border bg-white p-4 shadow-card"><div className="flex items-start justify-between gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Building2 className="size-5" /></span><Badge variant={client.isActive ? 'success' : 'neutral'}>{client.isActive ? 'Aktif' : 'Nonaktif'}</Badge></div><p className="mt-3 font-mono text-xs font-semibold text-brand">{client.referenceCode}</p><h2 className="mt-1 font-bold text-navy">{client.name}</h2><p className="mt-1 text-sm text-slate-500">{client.address ?? 'Alamat belum diisi'}</p><p className="mt-2 text-xs text-slate-500">{client.contactPerson ?? 'Kontak belum diisi'}{client.contactPhone ? ` · ${client.contactPhone}` : ''}</p><Button variant="secondary" className="mt-4 w-full" onClick={() => void openDetail(client)}>Lihat Detail</Button></article>)}{clients.length === 0 && <EmptyState title="Belum ada client" />}</div>

    <div className="hidden overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-surface md:block"><table className="w-full min-w-[820px] text-sm"><thead className="bg-surface-subtle text-left text-caption font-semibold uppercase tracking-wide text-muted"><tr><th scope="col" className="px-4 py-3">Kode</th><th scope="col" className="px-4 py-3">Nama</th><th scope="col" className="px-4 py-3">Alamat</th><th scope="col" className="px-4 py-3">Kontak</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3"><span className="sr-only">Tindakan</span></th></tr></thead><tbody>{clients.map((client) => <tr key={client.id} className="border-t border-border align-top"><td className="px-4 py-3 font-mono text-xs font-semibold text-brand">{client.referenceCode}</td><td className="max-w-56 break-words px-4 py-3 font-semibold text-navy [overflow-wrap:anywhere]">{client.name}</td><td className="max-w-72 break-words px-4 py-3 [overflow-wrap:anywhere]">{client.address ?? '-'}</td><td className="max-w-56 break-words px-4 py-3 [overflow-wrap:anywhere]">{client.contactPerson ?? '-'}{client.contactPhone ? ` (${client.contactPhone})` : ''}</td><td className="px-4 py-3"><Badge variant={client.isActive ? 'success' : 'neutral'}>{client.isActive ? 'Aktif' : 'Nonaktif'}</Badge></td><td className="px-4 py-3 text-right"><Button size="sm" variant="secondary" onClick={() => void openDetail(client)}>Detail</Button></td></tr>)}</tbody></table>{clients.length === 0 && <EmptyState title="Belum ada client" />}</div>

    <Dialog open={detailOpen} onOpenChange={setDetailOpen}><DialogContent className="sm:max-w-xl"><DialogTitle>{detailLoading ? 'Memuat detail client...' : detail?.name ?? 'Detail Client'}</DialogTitle><DialogDescription>Informasi client dan lokasi kerja yang terkait.</DialogDescription>{detail && <div className="mt-5 min-w-0 space-y-5"><div className="grid min-w-0 gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><DetailItem label="Kode referensi" value={detail.referenceCode} /><DetailItem label="Alamat" value={detail.address} /><DetailItem label="Status" value={detail.isActive ? 'Aktif' : 'Nonaktif'} /><DetailItem label="Contact person" value={detail.contactPerson} /><DetailItem label="Telepon" value={detail.contactPhone} /></div><section className="min-w-0"><h2 className="font-semibold text-navy">Lokasi Terkait</h2><div className="mt-3 min-w-0 space-y-2">{detail.locations.length ? detail.locations.map((location) => <div key={location.id} className="flex min-w-0 flex-wrap items-start gap-3 rounded-xl border p-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><MapPin className="size-4" /></span><div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]"><p className="font-mono text-xs font-semibold text-brand">{location.referenceCode}</p><p className="font-semibold text-navy">{location.name}</p><p className="mt-1 text-xs text-slate-500">{location.address ?? 'Alamat belum diisi'}</p></div><Badge variant={location.isActive ? 'success' : 'neutral'} className="shrink-0">{location.isActive ? 'Aktif' : 'Nonaktif'}</Badge></div>) : <EmptyState title="Belum ada lokasi terkait" />}</div></section></div>}</DialogContent></Dialog>
  </DossierPage>;
}

function DetailItem({ label, value }: { label: string; value?: string | null }) { return <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 break-words text-slate-700">{value || '-'}</p></div>; }
function ClientField({ label, value, onChange, description, className = '', ...props }: { label: string; value: string; onChange: (value: string) => void; description?: string; className?: string; required?: boolean; placeholder?: string; inputMode?: 'tel' }) { return <label className="text-sm font-semibold text-foreground">{label}<input {...props} value={value} onChange={(event) => onChange(event.target.value)} className={`input mt-1 w-full ${className}`} />{description && <span className="mt-1 block text-caption font-normal text-muted">{description}</span>}</label>; }
