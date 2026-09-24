'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { CalendarDays, Eye, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useSession } from '@/components/providers/SessionProvider';
import LocationMap from '@/components/locations/LocationMap';
import { XlsxImportPanel } from '@/components/XlsxImportPanel';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DossierPage } from '@/components/ui/dossier';
import {
  ActionMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, EmptyState } from '@/components/ui/feedback';

interface ClientOption {
  id: string;
  referenceCode: string;
  name: string;
}

interface LocationRow {
  id: string;
  referenceCode: string;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters: number;
  checkInTime: string;
  checkOutTime: string;
  toleranceMin: number;
  workDays: number[];
  clientId?: string | null;
  client?: ClientOption | null;
  isActive: boolean;
}

interface LocationForm {
  referenceCode: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  radiusMeters: number;
  checkInTime: string;
  checkOutTime: string;
  toleranceMin: number;
  workDays: number[];
  clientId: string;
  isActive: boolean;
}

interface DeleteTarget {
  location: LocationRow;
  force: boolean;
}

const DAYS = [
  { value: 1, short: 'Sen', label: 'Senin' },
  { value: 2, short: 'Sel', label: 'Selasa' },
  { value: 3, short: 'Rab', label: 'Rabu' },
  { value: 4, short: 'Kam', label: 'Kamis' },
  { value: 5, short: 'Jum', label: 'Jumat' },
  { value: 6, short: 'Sab', label: 'Sabtu' },
  { value: 0, short: 'Min', label: 'Minggu' },
];

const EMPTY_FORM: LocationForm = {
  referenceCode: '',
  name: '',
  address: '',
  latitude: '',
  longitude: '',
  radiusMeters: 300,
  checkInTime: '08:00',
  checkOutTime: '16:00',
  toleranceMin: 10,
  workDays: [1, 2, 3, 4, 5],
  clientId: '',
  isActive: true,
};

function coordinates(form: Pick<LocationForm, 'latitude' | 'longitude'>) {
  if (form.latitude.trim() === '' || form.longitude.trim() === '') return null;
  const latitude = Number(form.latitude);
  const longitude = Number(form.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : null;
}

function parseCoordinates(value: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value.trim());
  } catch {
    return null;
  }
  const patterns = [
    /#map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/i,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?)(?:,|%2C|\s)+(-?\d+(?:\.\d+)?)/i,
    /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/,
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) return { latitude, longitude };
  }
  return null;
}

function daySummary(workDays: number[]) {
  if (!workDays.length) return 'Tidak ada hari kerja';
  if ([1, 2, 3, 4, 5].every((day) => workDays.includes(day)) && workDays.length === 5) return 'Senin-Jumat';
  return DAYS.filter((day) => workDays.includes(day.value)).map((day) => day.short).join(', ');
}

function formFromLocation(location: LocationRow): LocationForm {
  return {
    referenceCode: location.referenceCode,
    name: location.name,
    address: location.address ?? '',
    latitude: location.latitude == null ? '' : String(location.latitude),
    longitude: location.longitude == null ? '' : String(location.longitude),
    radiusMeters: location.radiusMeters,
    checkInTime: location.checkInTime,
    checkOutTime: location.checkOutTime,
    toleranceMin: location.toleranceMin,
    workDays: location.workDays ?? [1, 2, 3, 4, 5],
    clientId: location.clientId ?? location.client?.id ?? '',
    isActive: location.isActive,
  };
}

export default function LocationsPage() {
  const { session } = useSession();
  const canManage = session.role === 'ADMIN_HR';
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const busyRef = useRef(false);
  const [pasteValue, setPasteValue] = useState('');
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const [form, setForm] = useState<LocationForm>(EMPTY_FORM);
  const [search, setSearch] = useState('');

  async function load() {
    try {
      const token = getToken();
      const [locs, cls] = await Promise.all([
        apiFetch<LocationRow[]>('/locations', { token }),
        apiFetch<ClientOption[]>('/clients', { token }),
      ]);
      setLocations(locs);
      setClients(cls);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat data lokasi');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function refreshPreservingScroll() {
    const scrollY = window.scrollY;
    await load();
    requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
  }

  function resetForm(next: LocationForm) {
    setForm(next);
    setPasteValue('');
    setCoordinateError(null);
    setError(null);
  }

  function openCreate() {
    if (!canManage || busyRef.current) return;
    resetForm({ ...EMPTY_FORM, workDays: [...EMPTY_FORM.workDays] });
    setEditing(null);
    setCreating(true);
  }

  function openEdit(location: LocationRow) {
    if (!canManage || busyRef.current) return;
    resetForm(formFromLocation(location));
    setCreating(false);
    setEditing(location);
  }

  function applyPastedCoordinates() {
    const point = parseCoordinates(pasteValue);
    if (!point) {
      setCoordinateError('Koordinat tidak dikenali. Gunakan format "lat, lng" atau URL peta yang memuat koordinat.');
      return;
    }
    setCoordinateError(null);
    setForm((current) => ({ ...current, latitude: point.latitude.toFixed(7), longitude: point.longitude.toFixed(7) }));
  }

  async function saveLocation(event: FormEvent, mode: 'create' | 'edit') {
    event.preventDefault();
    if (!canManage || busyRef.current || (mode === 'edit' && !editing)) return;
    const hasOneCoordinate = form.latitude.trim() !== '' || form.longitude.trim() !== '';
    const point = coordinates(form);
    if (mode === 'create' && !point) {
      setCoordinateError('Pilih pusat lokasi pada peta atau isi latitude dan longitude sebelum menyimpan.');
      return;
    }
    if (hasOneCoordinate && !point) {
      setCoordinateError('Latitude dan longitude harus lengkap dan berada dalam rentang yang valid.');
      return;
    }
    if (!form.workDays.length) {
      setError('Pilih minimal satu hari kerja.');
      return;
    }

    busyRef.current = true;
    setBusy('save');
    setError(null);
    try {
      const target = mode === 'create' ? '/locations' : `/locations/${editing!.id}`;
      await apiFetch(target, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        token: getToken(),
        body: {
          referenceCode: form.referenceCode,
          name: form.name,
          address: form.address,
          ...(point ?? (mode === 'edit' ? { latitude: null, longitude: null } : {})),
          radiusMeters: form.radiusMeters,
          checkInTime: form.checkInTime,
          checkOutTime: form.checkOutTime,
          toleranceMin: form.toleranceMin,
          workDays: form.workDays,
          clientId: form.clientId || (mode === 'create' ? undefined : null),
          ...(mode === 'edit' ? { isActive: form.isActive } : {}),
        },
      });
      if (mode === 'create') setCreating(false);
      else setEditing(null);
      await refreshPreservingScroll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan lokasi');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function removeLocation(reason: string) {
    if (!canManage || !deleteTarget || busyRef.current) return;
    const target = deleteTarget;
    busyRef.current = true;
    setBusy('delete');
    setError(null);
    try {
      await apiFetch(`/locations/${target.location.id}${target.force ? '/force-delete' : ''}`, {
        method: 'DELETE',
        token: getToken(),
        body: { reason },
      });
      setLocations((current) => current.filter((location) => location.id !== target.location.id));
      setExpandedId((current) => current === target.location.id ? null : current);
      setEditing((current) => current?.id === target.location.id ? null : current);
      setDeleteTarget(null);
      await refreshPreservingScroll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menghapus lokasi');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  const previewPoint = coordinates(form);
  const visibleLocations = locations.filter((location) => `${location.referenceCode} ${location.name} ${location.address ?? ''} ${location.client?.name ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));

  function renderLocationForm(mode: 'create' | 'edit') {
    const saving = busy === 'save';
    return (
      <form onSubmit={(event) => void saveLocation(event, mode)} aria-busy={saving} className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="min-w-0 text-sm font-medium text-slate-700">Kode referensi<input required value={form.referenceCode} onChange={(event) => setForm({ ...form, referenceCode: event.target.value })} placeholder="Contoh: LOC-PURWOKERTO" className="input mt-1 uppercase" /><span className="mt-1 block text-xs font-normal text-slate-500">Dipakai sebagai initialLocationReference saat import karyawan.</span></label>
            <label className="min-w-0 text-sm font-medium text-slate-700">Nama lokasi<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input mt-1" /></label>
            <label className="min-w-0 text-sm font-medium text-slate-700">Client<select value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value })} className="input mt-1"><option value="">Tanpa client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.referenceCode} - {client.name}</option>)}</select></label>
            <label className="min-w-0 text-sm font-medium text-foreground sm:col-span-2">Alamat<textarea required rows={2} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="input mt-1 h-auto w-full" /></label>
          </div>

          <div>
            <p className="text-sm font-semibold text-navy">Jadwal kerja</p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="min-w-0 text-sm text-slate-700">Jam masuk<input required type="time" value={form.checkInTime} onChange={(event) => setForm({ ...form, checkInTime: event.target.value })} className="input mt-1" /></label>
              <label className="min-w-0 text-sm text-slate-700">Jam pulang<input required type="time" value={form.checkOutTime} onChange={(event) => setForm({ ...form, checkOutTime: event.target.value })} className="input mt-1" /></label>
              <label className="col-span-2 min-w-0 text-sm text-slate-700 sm:col-span-1">Toleransi (menit)<input required type="number" min={0} value={form.toleranceMin} onChange={(event) => setForm({ ...form, toleranceMin: Number(event.target.value) })} className="input mt-1" /></label>
            </div>
            <fieldset className="mt-3"><legend className="text-sm text-slate-700">Hari kerja</legend><div className="mt-2 flex flex-wrap gap-2">{DAYS.map((day) => { const selected = form.workDays.includes(day.value); return <button key={day.value} type="button" aria-pressed={selected} title={day.label} onClick={() => setForm({ ...form, workDays: selected ? form.workDays.filter((value) => value !== day.value) : [...form.workDays, day.value] })} className={`min-h-11 min-w-11 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${selected ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>{day.short}</button>; })}</div></fieldset>
          </div>

          <Alert><span className="font-semibold">Mode presensi diatur pada data karyawan.</span> Lokasi tidak menyimpan mode presensi; titik dan radius ini digunakan ketika karyawan memakai mode Geofence.</Alert>
          {mode === 'edit' && <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="size-4 accent-blue-600" /><span><span className="block font-semibold text-navy">Lokasi aktif</span><span className="text-xs text-slate-500">Lokasi nonaktif tidak dapat dipilih untuk penempatan baru.</span></span></label>}
        </div>

        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="min-w-0 text-sm text-slate-700">Latitude<input type="number" step="any" min={-90} max={90} value={form.latitude} onChange={(event) => { setCoordinateError(null); setForm({ ...form, latitude: event.target.value }); }} placeholder="-90 s/d 90" className="input mt-1" /></label>
            <label className="min-w-0 text-sm text-slate-700">Longitude<input type="number" step="any" min={-180} max={180} value={form.longitude} onChange={(event) => { setCoordinateError(null); setForm({ ...form, longitude: event.target.value }); }} placeholder="-180 s/d 180" className="input mt-1" /></label>
            <label className="col-span-2 min-w-0 text-sm text-slate-700 sm:col-span-1">Radius (m)<input required type="number" min={50} value={form.radiusMeters} onChange={(event) => setForm({ ...form, radiusMeters: Number(event.target.value) })} className="input mt-1" /></label>
          </div>
          <div><label htmlFor={`${mode}-coordinate-source`} className="text-sm text-foreground">Tempel koordinat atau URL peta</label><div className="mt-1 flex min-w-0 flex-col gap-2 sm:flex-row"><input id={`${mode}-coordinate-source`} value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} placeholder="Contoh: lat, lng atau URL Google Maps/OSM" className="input min-w-0" /><Button type="button" variant="secondary" className="min-h-11 shrink-0" onClick={applyPastedCoordinates}>Terapkan</Button></div>{coordinateError && <p role="alert" className="mt-1 text-caption text-danger">{coordinateError}</p>}</div>
          <LocationMap point={previewPoint} radiusMeters={Math.max(form.radiusMeters || 0, 50)} editable onPick={(point) => { setCoordinateError(null); setForm((current) => ({ ...current, latitude: point.latitude.toFixed(7), longitude: point.longitude.toFixed(7) })); }} />
          <p className="text-xs text-slate-500">Klik peta untuk memindahkan pusat. Pratinjau lingkaran mengikuti radius yang diisi.</p>
        </div>

        <div className={`${mode === 'edit' ? 'sticky bottom-0 z-[500] bg-paper/95 backdrop-blur' : ''} -mx-1 flex flex-col-reverse gap-2 border-t px-1 pb-1 pt-4 sm:flex-row sm:justify-end lg:col-span-2`}>
          <Button type="button" variant="secondary" disabled={saving} onClick={() => mode === 'create' ? setCreating(false) : setEditing(null)}>Batal</Button>
          <Button disabled={saving}>{saving ? 'Menyimpan...' : mode === 'create' ? 'Simpan Lokasi' : 'Simpan Perubahan'}</Button>
        </div>
      </form>
    );
  }

  return (
    <DossierPage>
      <header className="mb-5 flex flex-col justify-between gap-4 border-b border-border bg-paper px-4 py-4 sm:flex-row sm:items-end">
        <div className="min-w-0"><h1 className="text-page-title text-brand">Lokasi Kerja</h1><p className="mt-1 text-body text-muted">Kelola titik geofence, radius, dan jadwal operasional lokasi.</p><p className="mt-2 text-caption font-semibold text-muted">REGISTRY · SITE &amp; GEOFENCE</p></div>
        {canManage && <Button onClick={creating ? () => setCreating(false) : openCreate} disabled={busy !== null}>{creating ? 'Tutup Form' : <><Plus className="size-4" />Tambah Lokasi</>}</Button>}
      </header>

      {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
      {canManage && <XlsxImportPanel resource="locations" title="Impor Lokasi dari Excel" onCommitted={load} />}

      {canManage && creating && (
        <Card className="mb-6 min-w-0 overflow-hidden shadow-none">
          <CardHeader className="border-b bg-slate-50/70 pb-4"><CardTitle>Tambah Lokasi</CardTitle><p className="mt-1 text-sm text-slate-500">Atur data operasional dan pilih pusat geofence pada peta.</p></CardHeader>
          <CardContent className="min-w-0 pt-5">{renderLocationForm('create')}</CardContent>
        </Card>
      )}

      {locations.length > 0 && <div className="mb-4 min-w-0 overflow-hidden rounded-xl border border-border bg-paper p-4"><p className="text-sm font-semibold text-navy">Kode Referensi Lokasi</p><p className="mt-1 text-xs text-muted">Gunakan kode berikut pada kolom initialLocationReference di template karyawan.</p><div className="mt-3 flex min-w-0 flex-wrap gap-2">{locations.map((location) => <span key={location.id} className="max-w-full break-words rounded-lg bg-surface-subtle px-2.5 py-1.5 text-xs text-muted"><code className="font-semibold text-brand">{location.referenceCode}</code> · {location.name}</span>)}</div></div>}

      <label className="mb-4 block max-w-xl text-sm font-semibold text-foreground">Cari lokasi<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kode, nama, alamat, atau client" className="input mt-1 w-full" /></label>

      {!visibleLocations.length ? (
        <EmptyState title={locations.length ? 'Lokasi tidak ditemukan' : 'Belum ada lokasi kerja'} description={locations.length ? 'Ubah kata pencarian untuk melihat lokasi lain.' : 'Lokasi yang dibuat akan tampil di sini.'} action={!locations.length && canManage && <Button onClick={openCreate}><Plus className="size-4" />Tambah Lokasi</Button>} />
      ) : (
        <div className="grid min-w-0 gap-3 md:grid-cols-2 [&>div]:shadow-none">
          {visibleLocations.map((location) => {
            const expanded = expandedId === location.id;
            const point = location.latitude != null && location.longitude != null ? { latitude: location.latitude, longitude: location.longitude } : null;
            return (
              <Card key={location.id} className="min-w-0 overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2"><CardTitle className="min-w-0 truncate">{location.name}</CardTitle><Badge variant={location.isActive ? 'success' : 'neutral'}>{location.isActive ? 'Aktif' : 'Nonaktif'}</Badge></div><p className="mt-1 truncate text-sm text-slate-500">{location.address || location.client?.name || 'Alamat belum diisi'}</p></div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><ActionMenuTrigger label={`Tindakan untuk lokasi ${location.name}`} disabled={busy !== null} /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-48">
                        <DropdownMenuItem onSelect={() => setExpandedId(expanded ? null : location.id)}><Eye className="size-4" />{expanded ? 'Tutup Detail' : 'Detail'}</DropdownMenuItem>
                        {canManage && <DropdownMenuItem onSelect={() => openEdit(location)}><Pencil className="size-4" />Edit</DropdownMenuItem>}
                        {canManage && <DropdownMenuSeparator className="my-1 h-px bg-border" />}
                        {canManage && <DropdownMenuItem danger onSelect={() => setDeleteTarget({ location, force: false })}><Trash2 className="size-4" />Delete</DropdownMenuItem>}
                        {canManage && <DropdownMenuItem danger onSelect={() => setDeleteTarget({ location, force: true })}><Trash2 className="size-4" />Force Delete</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="min-w-0 pt-2">
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div className="min-w-0 rounded-xl bg-slate-50 p-3"><MapPin className="mb-2 size-4 text-brand" /><p className="text-xs text-slate-500">Geofence</p><p className="mt-0.5 font-semibold text-navy">{location.radiusMeters} meter</p></div>
                    <div className="min-w-0 rounded-xl bg-slate-50 p-3"><CalendarDays className="mb-2 size-4 text-brand" /><p className="text-xs text-slate-500">Jam kerja</p><p className="mt-0.5 font-semibold text-navy">{location.checkInTime}-{location.checkOutTime}</p></div>
                    <div className="col-span-2 min-w-0 rounded-xl bg-slate-50 p-3 sm:col-span-1"><p className="text-xs text-slate-500">Hari / toleransi</p><p className="mt-1 break-words font-semibold text-navy">{daySummary(location.workDays ?? [])}</p><p className="text-xs text-slate-500">{location.toleranceMin} menit</p></div>
                  </div>
                  {expanded && <div className="mt-4 min-w-0 space-y-3 border-t border-slate-100 pt-4"><div className="grid min-w-0 grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm"><div className="min-w-0"><p className="text-xs text-slate-500">Kode referensi</p><p className="break-all font-mono font-semibold text-brand">{location.referenceCode}</p></div><div className="min-w-0"><p className="text-xs text-slate-500">Client</p><p className="break-words font-semibold text-navy">{location.client?.name ?? 'Tanpa client'}</p></div><div className="min-w-0"><p className="text-xs text-slate-500">Latitude</p><p className="break-all font-mono text-navy">{location.latitude ?? '-'}</p></div><div className="min-w-0"><p className="text-xs text-slate-500">Longitude</p><p className="break-all font-mono text-navy">{location.longitude ?? '-'}</p></div></div><LocationMap point={point} radiusMeters={location.radiusMeters} /></div>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !busyRef.current) setEditing(null); }}>
        <DialogContent showClose={busy !== 'save'} aria-busy={busy === 'save'} onEscapeKeyDown={(event) => { if (busy === 'save') event.preventDefault(); }} onPointerDownOutside={(event) => { if (busy === 'save') event.preventDefault(); }} className="inset-0 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:left-1/2 sm:top-1/2 sm:h-[min(94dvh,900px)] sm:w-[calc(100%-2rem)] sm:max-w-6xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border sm:p-6">
          <DialogTitle>Edit {editing?.name ?? 'Lokasi'}</DialogTitle>
          <DialogDescription>Perbarui seluruh data operasional, pusat peta, dan radius geofence lokasi.</DialogDescription>
          {editing && <div className="mt-5 min-w-0">{renderLocationForm('edit')}</div>}
        </DialogContent>
      </Dialog>

      <ActionDialog
        open={!!deleteTarget}
        title={deleteTarget?.force ? 'Force Delete Lokasi?' : 'Delete Lokasi?'}
        description={deleteTarget?.force ? `${deleteTarget.location.name} akan dinonaktifkan dan dihapus dari daftar aktif meskipun memiliki riwayat terkait.` : `${deleteTarget?.location.name ?? 'Lokasi'} hanya dapat dihapus jika belum memiliki relasi atau riwayat terlindungi.`}
        reasonLabel="Alasan penghapusan"
        reasonRequired
        confirmLabel={deleteTarget?.force ? 'Force Delete' : 'Delete'}
        danger
        busy={busy === 'delete'}
        onClose={() => { if (!busyRef.current) setDeleteTarget(null); }}
        onConfirm={removeLocation}
      />
    </DossierPage>
  );
}
