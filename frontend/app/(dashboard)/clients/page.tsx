'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Building2, MapPin } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useSession } from '@/components/providers/SessionProvider';
import { XlsxImportPanel } from '@/components/XlsxImportPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  ActionMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { DossierPage } from '@/components/ui/dossier';

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

type ClientForm = Pick<ClientRow, 'referenceCode' | 'name'> & {
  address: string;
  contactPerson: string;
  contactPhone: string;
};

type DeleteAction = { client: ClientRow; force: boolean };

const EMPTY_FORM: ClientForm = { referenceCode: '', name: '', address: '', contactPerson: '', contactPhone: '' };

export default function ClientsPage() {
  const { session } = useSession();
  const canManage = session.role === 'ADMIN_HR';
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<(ClientRow & ClientForm) | null>(null);
  const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [search, setSearch] = useState('');

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
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuat client');
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(client: ClientRow) {
    setEditing({
      ...client,
      address: client.address ?? '',
      contactPerson: client.contactPerson ?? '',
      contactPhone: client.contactPhone ?? '',
    });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || mutationBusy) return;
    setMutationBusy(true);
    setError(null);
    try {
      await apiFetch(`/clients/${editing.id}`, {
        method: 'PATCH',
        token: getToken(),
        body: {
          referenceCode: editing.referenceCode,
          name: editing.name,
          address: editing.address,
          contactPerson: editing.contactPerson,
          contactPhone: editing.contactPhone,
        },
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memperbarui client');
    } finally {
      setMutationBusy(false);
    }
  }

  async function deleteClient(reason: string) {
    if (!deleteAction || mutationBusy) return;
    const { client, force } = deleteAction;
    setMutationBusy(true);
    setError(null);
    try {
      await apiFetch(`/clients/${client.id}${force ? '/force-delete' : ''}`, {
        method: 'DELETE',
        token: getToken(),
        body: { reason },
      });
      setClients((current) => current.filter((row) => row.id !== client.id));
      if (detail?.id === client.id) {
        setDetailOpen(false);
        setDetail(null);
      }
      setDeleteAction(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : force ? 'Gagal menghapus paksa client' : 'Gagal menghapus client');
    } finally {
      setMutationBusy(false);
    }
  }

  const actionProps = {
    canManage,
    onDetail: (client: ClientRow) => void openDetail(client),
    onEdit: openEdit,
    onDelete: (client: ClientRow, force: boolean) => setDeleteAction({ client, force }),
  };
  const visibleClients = clients.filter((client) => `${client.referenceCode} ${client.name} ${client.address ?? ''} ${client.contactPerson ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));

  return <DossierPage className="space-y-4">
    <header className="flex flex-col justify-between gap-4 border-b border-border bg-paper px-4 py-4 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <h1 className="text-page-title text-brand">Client</h1>
        <p className="mt-1 text-body text-muted">Kelola identitas client dan lokasi kerja yang terhubung.</p>
        <p className="mt-2 text-caption font-semibold text-muted">REGISTRY · CLIENT & SITE</p>
      </div>
      {canManage && <Button onClick={() => setShowForm((value) => !value)}>{showForm ? 'Tutup Form' : 'Tambah Client'}</Button>}
    </header>

    {error && <Alert variant="danger" title="Data client tidak dapat diproses">{error}</Alert>}
    {canManage && <XlsxImportPanel resource="clients" title="Impor Client dari Excel" onCommitted={load} />}
    {canManage && showForm && <form onSubmit={onCreate} aria-busy={submitting} className="grid max-w-xl gap-4 rounded-xl border border-border bg-paper p-4">
      <ClientField label="Kode referensi" required value={form.referenceCode} onChange={(value) => setForm({ ...form, referenceCode: value })} placeholder="Contoh: CL-SINAR-ABADI" className="uppercase" description="Kode unik ini dipakai pada template import lokasi." />
      <ClientField label="Nama client" required value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
      <ClientField label="Alamat" value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
      <ClientField label="Contact person" value={form.contactPerson} onChange={(value) => setForm({ ...form, contactPerson: value })} />
      <ClientField label="Nomor telepon" value={form.contactPhone} onChange={(value) => setForm({ ...form, contactPhone: value })} inputMode="tel" />
      <Button disabled={submitting}>{submitting ? 'Menyimpan...' : 'Simpan Client'}</Button>
    </form>}

    <label className="block max-w-xl text-sm font-semibold text-foreground">Cari client<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kode, nama, alamat, atau kontak" className="input mt-1 w-full" /></label>

    <div className="grid gap-3 md:hidden">
      {visibleClients.map((client) => <article key={client.id} className="rounded-xl border border-border bg-paper p-4">
        <div className="flex items-start justify-between gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-subtle text-brand"><Building2 className="size-5" /></span><Badge variant={client.isActive ? 'success' : 'neutral'}>{client.isActive ? 'Aktif' : 'Nonaktif'}</Badge></div>
        <p className="mt-3 font-mono text-xs font-semibold text-brand">{client.referenceCode}</p>
        <h2 className="mt-1 font-bold text-navy">{client.name}</h2>
        <p className="mt-1 break-words text-sm text-muted [overflow-wrap:anywhere]">{client.address ?? 'Alamat belum diisi'}</p>
        <p className="mt-2 break-words text-xs text-muted [overflow-wrap:anywhere]">{client.contactPerson ?? 'Kontak belum diisi'}{client.contactPhone ? ` · ${client.contactPhone}` : ''}</p>
        <div className="mt-4 flex justify-end"><ClientActions client={client} {...actionProps} /></div>
      </article>)}
      {visibleClients.length === 0 && <EmptyState title={clients.length ? 'Client tidak ditemukan' : 'Belum ada client'} />}
    </div>

    <div className="hidden overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-paper md:block">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-surface-subtle text-left text-caption font-semibold text-muted"><tr><th scope="col" className="px-3 py-2.5">Kode</th><th scope="col" className="px-3 py-2.5">Nama</th><th scope="col" className="px-3 py-2.5">Alamat</th><th scope="col" className="px-3 py-2.5">Kontak</th><th scope="col" className="px-3 py-2.5">Status</th><th scope="col" className="px-3 py-2.5"><span className="sr-only">Tindakan</span></th></tr></thead>
        <tbody>{visibleClients.map((client) => <tr key={client.id} className="border-t border-border align-top transition-colors hover:bg-surface-subtle/70"><td className="px-3 py-2.5 font-mono text-xs font-semibold text-brand">{client.referenceCode}</td><td className="max-w-56 break-words px-3 py-2.5 font-semibold text-navy [overflow-wrap:anywhere]">{client.name}</td><td className="max-w-72 break-words px-3 py-2.5 [overflow-wrap:anywhere]">{client.address ?? '-'}</td><td className="max-w-56 break-words px-3 py-2.5 [overflow-wrap:anywhere]">{client.contactPerson ?? '-'}{client.contactPhone ? ` (${client.contactPhone})` : ''}</td><td className="px-3 py-2.5"><Badge variant={client.isActive ? 'success' : 'neutral'}>{client.isActive ? 'Aktif' : 'Nonaktif'}</Badge></td><td className="px-3 py-2.5 text-right"><ClientActions client={client} {...actionProps} /></td></tr>)}</tbody>
      </table>
      {visibleClients.length === 0 && <EmptyState title={clients.length ? 'Client tidak ditemukan' : 'Belum ada client'} />}
    </div>

    <Dialog open={detailOpen} onOpenChange={setDetailOpen}><DialogContent className="sm:max-w-xl"><DialogTitle>{detailLoading ? 'Memuat detail client...' : detail?.name ?? 'Detail Client'}</DialogTitle><DialogDescription>Informasi client dan lokasi kerja yang terkait.</DialogDescription>{detail && <div className="mt-5 min-w-0 space-y-5"><div className="grid min-w-0 gap-3 rounded-xl bg-surface-subtle p-4 text-sm sm:grid-cols-2"><DetailItem label="Kode referensi" value={detail.referenceCode} /><DetailItem label="Alamat" value={detail.address} /><DetailItem label="Status" value={detail.isActive ? 'Aktif' : 'Nonaktif'} /><DetailItem label="Contact person" value={detail.contactPerson} /><DetailItem label="Telepon" value={detail.contactPhone} /></div><section className="min-w-0"><h2 className="font-semibold text-navy">Lokasi Terkait</h2><div className="mt-3 min-w-0 space-y-2">{detail.locations.length ? detail.locations.map((location) => <div key={location.id} className="flex min-w-0 flex-wrap items-start gap-3 rounded-xl border p-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-subtle text-brand"><MapPin className="size-4" /></span><div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]"><p className="font-mono text-xs font-semibold text-brand">{location.referenceCode}</p><p className="font-semibold text-navy">{location.name}</p><p className="mt-1 text-xs text-muted">{location.address ?? 'Alamat belum diisi'}</p></div><Badge variant={location.isActive ? 'success' : 'neutral'} className="shrink-0">{location.isActive ? 'Aktif' : 'Nonaktif'}</Badge></div>) : <EmptyState title="Belum ada lokasi terkait" />}</div></section></div>}</DialogContent></Dialog>

    <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !mutationBusy) setEditing(null); }}><DialogContent className="sm:max-w-xl" showClose={!mutationBusy} aria-busy={mutationBusy} onEscapeKeyDown={(event) => { if (mutationBusy) event.preventDefault(); }} onPointerDownOutside={(event) => { if (mutationBusy) event.preventDefault(); }}><DialogTitle>Edit Client</DialogTitle><DialogDescription>Perbarui identitas dan kontak {editing?.name ?? 'client'}.</DialogDescription>{editing && <form onSubmit={saveEdit} className="mt-5 grid gap-4"><ClientField label="Kode referensi" required value={editing.referenceCode} onChange={(value) => setEditing({ ...editing, referenceCode: value })} className="uppercase" description="Kode unik ini dipakai pada template import lokasi." /><ClientField label="Nama client" required value={editing.name} onChange={(value) => setEditing({ ...editing, name: value })} /><ClientField label="Alamat" value={editing.address} onChange={(value) => setEditing({ ...editing, address: value })} /><ClientField label="Contact person" value={editing.contactPerson} onChange={(value) => setEditing({ ...editing, contactPerson: value })} /><ClientField label="Nomor telepon" value={editing.contactPhone} onChange={(value) => setEditing({ ...editing, contactPhone: value })} inputMode="tel" /><div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" disabled={mutationBusy} onClick={() => setEditing(null)}>Batal</Button><Button disabled={mutationBusy}>{mutationBusy ? 'Menyimpan...' : 'Simpan Perubahan'}</Button></div></form>}</DialogContent></Dialog>

    <ActionDialog open={!!deleteAction} title={deleteAction?.force ? 'Force Delete Client' : 'Hapus Client'} description={deleteAction?.force ? `Hapus paksa ${deleteAction.client.name} dari daftar aktif dan pertahankan riwayat terkait.` : `Hapus ${deleteAction?.client.name ?? 'client'} jika belum memiliki relasi atau riwayat terlindungi.`} reasonLabel="Alasan penghapusan" reasonRequired confirmLabel={deleteAction?.force ? 'Force Delete' : 'Hapus Client'} danger busy={mutationBusy} onClose={() => setDeleteAction(null)} onConfirm={deleteClient} />
  </DossierPage>;
}

function ClientActions({ client, canManage, onDetail, onEdit, onDelete }: { client: ClientRow; canManage: boolean; onDetail: (client: ClientRow) => void; onEdit: (client: ClientRow) => void; onDelete: (client: ClientRow, force: boolean) => void }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><ActionMenuTrigger label={`Tindakan untuk client ${client.name}`} /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onDetail(client)}>Detail</DropdownMenuItem>{canManage && <><DropdownMenuItem onSelect={() => onEdit(client)}>Edit</DropdownMenuItem><DropdownMenuSeparator className="my-1 h-px bg-border" /><DropdownMenuItem danger onSelect={() => onDelete(client, false)}>Delete</DropdownMenuItem><DropdownMenuItem danger onSelect={() => onDelete(client, true)}>Force Delete</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>;
}

function DetailItem({ label, value }: { label: string; value?: string | null }) { return <div><p className="text-xs font-semibold text-muted">{label}</p><p className="mt-1 break-words text-foreground">{value || '-'}</p></div>; }
function ClientField({ label, value, onChange, description, className = '', ...props }: { label: string; value: string; onChange: (value: string) => void; description?: string; className?: string; required?: boolean; placeholder?: string; inputMode?: 'tel' }) { return <label className="text-sm font-semibold text-foreground">{label}<input {...props} value={value} onChange={(event) => onChange(event.target.value)} className={`input mt-1 w-full ${className}`} />{description && <span className="mt-1 block text-caption font-normal text-muted">{description}</span>}</label>; }
