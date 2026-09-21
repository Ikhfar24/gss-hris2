'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, MapPin, Pencil, Plus, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useSession } from '@/components/providers/SessionProvider';
import LocationMap from '@/components/locations/LocationMap';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DossierPage } from '@/components/ui/dossier';
import { XlsxImportPanel } from '@/components/XlsxImportPanel';

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
  client?: { id: string; referenceCode: string; name: string } | null;
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
  referenceCode: '', name: '', address: '', latitude: '', longitude: '', radiusMeters: 300,
  checkInTime: '08:00', checkOutTime: '16:00', toleranceMin: 10,
  workDays: [1, 2, 3, 4, 5], clientId: '', isActive: true,
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

export default function LocationsPage() {
  const { session } = useSession();
  const canManage = session.role === 'ADMIN_HR' || session.role === 'SYSTEM_ADMIN';
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LocationRow | null | 'new'>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const [form, setForm] = useState<LocationForm>(EMPTY_FORM);

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
    load();
  }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setPasteValue('');
    setCoordinateError(null);
    setEditing('new');
  }

  function openEdit(location: LocationRow) {
    setForm({
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
    });
    setPasteValue('');
    setCoordinateError(null);
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const hasOneCoordinate = form.latitude.trim() !== '' || form.longitude.trim() !== '';
    const point = coordinates(form);
    if (editing === 'new' && !point) {
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
    setSubmitting(true);
    setError(null);
    try {
      const isCreate = editing === 'new';
      await apiFetch(isCreate ? '/locations' : `/locations/${(editing as LocationRow).id}`, {
        method: isCreate ? 'POST' : 'PATCH',
        token: getToken(),
        body: {
          referenceCode: form.referenceCode,
          name: form.name,
          address: form.address,
          ...(point ?? (!isCreate ? { latitude: null, longitude: null } : {})),
          radiusMeters: form.radiusMeters,
          checkInTime: form.checkInTime,
          checkOutTime: form.checkOutTime,
          toleranceMin: form.toleranceMin,
          workDays: form.workDays,
          clientId: form.clientId || (isCreate ? undefined : null),
          ...(!isCreate ? { isActive: form.isActive } : {}),
        },
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan lokasi');
    } finally {
      setSubmitting(false);
    }
  }

  const previewPoint = coordinates(form);

  return (
    <DossierPage>
      <header className="mb-5 flex flex-col justify-between gap-4 border-b border-border bg-paper px-4 py-4 sm:flex-row sm:items-end"><div className="min-w-0"><h1 className="text-page-title text-brand">Lokasi Kerja</h1><p className="mt-1 text-body text-muted">Kelola titik geofence, radius, dan jadwal operasional lokasi.</p><p className="mt-2 text-caption font-semibold text-muted">REGISTRY · SITE & GEOFENCE</p></div>{canManage && <Button onClick={editing ? () => setEditing(null) : openCreate}>{editing ? <X className="size-4" /> : <Plus className="size-4" />}{editing ? 'Tutup Form' : 'Tambah Lokasi'}</Button>}</header>

      {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

      {canManage && <XlsxImportPanel resource="locations" title="Impor Lokasi dari Excel" onCommitted={load} />}

      {canManage && editing && (
        <Card className="mb-6 overflow-hidden shadow-none">
          <CardHeader className="border-b bg-slate-50/70 pb-4">
            <CardTitle>{editing === 'new' ? 'Tambah Lokasi' : `Edit ${editing.name}`}</CardTitle>
            <p className="mt-1 text-sm text-slate-500">Atur data operasional dan pilih pusat geofence pada peta.</p>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={onSubmit} aria-busy={submitting} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">Kode referensi<input required value={form.referenceCode} onChange={(e) => setForm({ ...form, referenceCode: e.target.value })} placeholder="Contoh: LOC-PURWOKERTO" className="input mt-1 uppercase" /><span className="mt-1 block text-xs font-normal text-slate-500">Dipakai sebagai initialLocationReference saat import karyawan.</span></label>
                  <label className="text-sm font-medium text-slate-700">Nama lokasi<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input mt-1" /></label>
                  <label className="text-sm font-medium text-slate-700">Client<select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className="input mt-1"><option value="">Tanpa client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.referenceCode} - {client.name}</option>)}</select></label>
                  <label className="text-sm font-medium text-foreground sm:col-span-2">Alamat<textarea required rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input mt-1 w-full" /></label>
                </div>

                <div>
                  <p className="text-sm font-semibold text-navy">Jadwal kerja</p>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <label className="text-sm text-slate-700">Jam masuk<input required type="time" value={form.checkInTime} onChange={(e) => setForm({ ...form, checkInTime: e.target.value })} className="input mt-1" /></label>
                    <label className="text-sm text-slate-700">Jam pulang<input required type="time" value={form.checkOutTime} onChange={(e) => setForm({ ...form, checkOutTime: e.target.value })} className="input mt-1" /></label>
                    <label className="text-sm text-slate-700">Toleransi (menit)<input required type="number" min={0} value={form.toleranceMin} onChange={(e) => setForm({ ...form, toleranceMin: Number(e.target.value) })} className="input mt-1" /></label>
                  </div>
                  <fieldset className="mt-3"><legend className="text-sm text-slate-700">Hari kerja</legend><div className="mt-2 flex flex-wrap gap-2">{DAYS.map((day) => { const selected = form.workDays.includes(day.value); return <button key={day.value} type="button" aria-pressed={selected} title={day.label} onClick={() => setForm({ ...form, workDays: selected ? form.workDays.filter((value) => value !== day.value) : [...form.workDays, day.value] })} className={`min-w-11 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${selected ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>{day.short}</button>; })}</div></fieldset>
                </div>

                <Alert><span className="font-semibold">Mode presensi diatur pada data karyawan.</span> Lokasi tidak menyimpan mode presensi; titik dan radius ini digunakan ketika karyawan memakai mode Geofence.</Alert>
                {editing !== 'new' && <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-blue-600" /><span><span className="block font-semibold text-navy">Lokasi aktif</span><span className="text-xs text-slate-500">Lokasi nonaktif tidak dapat dipilih untuk penempatan baru.</span></span></label>}
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm text-slate-700">Latitude<input type="number" step="any" min={-90} max={90} value={form.latitude} onChange={(e) => { setCoordinateError(null); setForm({ ...form, latitude: e.target.value }); }} placeholder="-90 s/d 90" className="input mt-1" /></label>
                  <label className="text-sm text-slate-700">Longitude<input type="number" step="any" min={-180} max={180} value={form.longitude} onChange={(e) => { setCoordinateError(null); setForm({ ...form, longitude: e.target.value }); }} placeholder="-180 s/d 180" className="input mt-1" /></label>
                  <label className="text-sm text-slate-700">Radius (m)<input required type="number" min={50} value={form.radiusMeters} onChange={(e) => setForm({ ...form, radiusMeters: Number(e.target.value) })} className="input mt-1" /></label>
                </div>
                <div><label htmlFor="coordinate-source" className="text-sm text-foreground">Tempel koordinat atau URL peta</label><div className="mt-1 flex flex-col gap-2 sm:flex-row"><input id="coordinate-source" value={pasteValue} onChange={(e) => setPasteValue(e.target.value)} placeholder="Contoh: lat, lng atau URL Google Maps/OSM" className="input" /><Button type="button" variant="secondary" onClick={applyPastedCoordinates}>Terapkan</Button></div>{coordinateError && <p role="alert" className="mt-1 text-caption text-danger">{coordinateError}</p>}</div>
                <LocationMap point={previewPoint} radiusMeters={Math.max(form.radiusMeters || 0, 50)} editable onPick={(point) => { setCoordinateError(null); setForm((current) => ({ ...current, latitude: point.latitude.toFixed(7), longitude: point.longitude.toFixed(7) })); }} />
                <p className="text-xs text-slate-500">Klik peta untuk memindahkan pusat. Pratinjau lingkaran mengikuti radius yang diisi.</p>
              </div>

              <div className="flex justify-end gap-2 border-t pt-4 lg:col-span-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Batal</Button><Button disabled={submitting}>{submitting ? 'Menyimpan...' : editing === 'new' ? 'Simpan Lokasi' : 'Simpan Perubahan'}</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      {locations.length > 0 && <div className="mb-4 rounded-xl border border-border bg-paper p-4"><p className="text-sm font-semibold text-navy">Kode Referensi Lokasi</p><p className="mt-1 text-xs text-muted">Gunakan kode berikut pada kolom initialLocationReference di template karyawan.</p><div className="mt-3 flex flex-wrap gap-2">{locations.map((location) => <span key={location.id} className="rounded-lg bg-surface-subtle px-2.5 py-1.5 text-xs text-muted"><code className="font-semibold text-brand">{location.referenceCode}</code> · {location.name}</span>)}</div></div>}

      {!locations.length ? <EmptyState title="Belum ada lokasi kerja" description="Lokasi yang dibuat akan tampil di sini." action={canManage && <Button onClick={openCreate}><Plus className="size-4" />Tambah Lokasi</Button>} /> : <div className="grid gap-3 md:grid-cols-2 [&>div]:shadow-none">{locations.map((location) => {
        const expanded = expandedId === location.id;
        const point = location.latitude != null && location.longitude != null ? { latitude: location.latitude, longitude: location.longitude } : null;
        return <Card key={location.id} className="overflow-hidden"><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CardTitle className="truncate">{location.name}</CardTitle><Badge variant={location.isActive ? 'success' : 'neutral'}>{location.isActive ? 'Aktif' : 'Nonaktif'}</Badge></div><p className="mt-1 truncate text-sm text-slate-500">{location.address || location.client?.name || 'Alamat belum diisi'}</p></div>{canManage && <Button size="sm" variant="secondary" onClick={() => openEdit(location)}><Pencil className="size-3.5" />Edit</Button>}</div></CardHeader><CardContent className="pt-2"><div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><MapPin className="mb-2 size-4 text-brand" /><p className="text-xs text-slate-500">Geofence</p><p className="mt-0.5 font-semibold text-navy">{location.radiusMeters} meter</p></div><div className="rounded-xl bg-slate-50 p-3"><CalendarDays className="mb-2 size-4 text-brand" /><p className="text-xs text-slate-500">Jam kerja</p><p className="mt-0.5 font-semibold text-navy">{location.checkInTime}-{location.checkOutTime}</p></div><div className="col-span-2 rounded-xl bg-slate-50 p-3 sm:col-span-1"><p className="text-xs text-slate-500">Hari / toleransi</p><p className="mt-1 font-semibold text-navy">{daySummary(location.workDays ?? [])}</p><p className="text-xs text-slate-500">{location.toleranceMin} menit</p></div></div><button type="button" onClick={() => setExpandedId(expanded ? null : location.id)} className="mt-3 flex w-full items-center justify-between border-t border-slate-100 pt-3 text-sm font-semibold text-slate-600"><span>{expanded ? 'Tutup detail lokasi' : 'Lihat koordinat dan peta'}</span>{expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</button>{expanded && <div className="mt-4 space-y-3"><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-slate-500">Latitude</p><p className="font-mono text-xs sm:text-sm">{location.latitude == null ? 'Belum diatur' : location.latitude.toFixed(7)}</p></div><div><p className="text-xs text-slate-500">Longitude</p><p className="font-mono text-xs sm:text-sm">{location.longitude == null ? 'Belum diatur' : location.longitude.toFixed(7)}</p></div></div><LocationMap point={point} radiusMeters={location.radiusMeters} />{!point && canManage && <Button className="w-full" variant="secondary" onClick={() => openEdit(location)}><MapPin className="size-4" />Tambahkan Koordinat</Button>}</div>}</CardContent></Card>;
      })}</div>}
    </DossierPage>
  );
}
