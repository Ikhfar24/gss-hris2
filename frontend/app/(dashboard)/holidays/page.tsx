'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus, Trash2 } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useSession } from '@/components/providers/SessionProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Alert } from '@/components/ui/feedback';
import { DossierPage } from '@/components/ui/dossier';

type HolidayType = 'NATIONAL' | 'CUTI_BERSAMA' | 'LOCATION_SPECIFIC';

interface HolidayRow {
  id: string;
  date: string;
  name: string;
  type: HolidayType;
  location?: { id: string; name: string } | null;
}

interface LocationOption { id: string; name: string; isActive?: boolean }

const TYPE_LABEL: Record<HolidayType, string> = {
  NATIONAL: 'Libur Nasional',
  CUTI_BERSAMA: 'Cuti Bersama',
  LOCATION_SPECIFIC: 'Khusus Lokasi',
};
const WEEKDAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_FORMAT = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });

function dateKey(value: Date | string) {
  if (typeof value === 'string') return value.slice(0, 10);
  const year = value.getFullYear();
  return `${year}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function localDate(key: string) { return new Date(`${key}T00:00:00`); }

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export default function HolidaysPage() {
  const { session } = useSession();
  const canManage = session.role === 'ADMIN_HR' || session.role === 'SYSTEM_ADMIN';
  const now = new Date();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(now));
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<HolidayRow | null>(null);
  const [form, setForm] = useState<{ date: string; name: string; type: HolidayType; locationId: string }>({ date: dateKey(now), name: '', type: 'NATIONAL', locationId: '' });

  async function load() {
    setError(null);
    try {
      const [holidayData, locationData] = await Promise.all([
        apiFetch<HolidayRow[]>('/holidays', { token: getToken() }),
        canManage ? apiFetch<LocationOption[]>('/locations', { token: getToken() }) : Promise.resolve([]),
      ]);
      setHolidays(holidayData);
      setLocations(locationData.filter((location) => location.isActive !== false));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat kalender hari libur');
    }
  }

  useEffect(() => { void load(); }, []);

  function selectDay(day: Date) {
    const key = dateKey(day);
    setSelectedDate(key);
    if (day.getMonth() !== month.getMonth() || day.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
    }
  }

  function openCreate() {
    setForm({ date: selectedDate, name: '', type: 'NATIONAL', locationId: '' });
    setShowForm(true);
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/holidays', {
        method: 'POST', token: getToken(),
        body: { date: form.date, name: form.name.trim(), type: form.type, locationId: form.type === 'LOCATION_SPECIFIC' ? form.locationId : undefined },
      });
      setSelectedDate(form.date);
      const createdDate = localDate(form.date);
      setMonth(new Date(createdDate.getFullYear(), createdDate.getMonth(), 1));
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menambah hari libur');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/holidays/${pendingDelete.id}`, { method: 'DELETE', token: getToken() });
      setPendingDelete(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menghapus hari libur');
    } finally {
      setDeleting(false);
    }
  }

  const days = calendarDays(month);
  const holidaysByDate = new Map<string, HolidayRow[]>();
  for (const holiday of holidays) {
    const key = dateKey(holiday.date);
    holidaysByDate.set(key, [...(holidaysByDate.get(key) ?? []), holiday]);
  }
  const selectedHolidays = holidaysByDate.get(selectedDate) ?? [];
  const monthHolidays = holidays.filter((holiday) => {
    const date = localDate(dateKey(holiday.date));
    return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
  });

  return <DossierPage>
    <header className="mb-5 flex flex-col justify-between gap-4 border-b border-border bg-paper px-4 py-4 sm:flex-row sm:items-end"><div className="min-w-0"><h1 className="text-page-title text-brand">Hari Libur & Kalender</h1><p className="mt-1 text-body text-muted">Jadwal libur nasional, cuti bersama, dan libur khusus lokasi.</p><p className="mt-2 text-caption font-semibold text-muted">REGISTRY · KALENDER OPERASIONAL</p></div>{canManage && <Button onClick={showForm ? () => setShowForm(false) : openCreate} variant={showForm ? 'secondary' : 'primary'}><Plus className="size-4" />{showForm ? 'Tutup Form' : 'Tambah Hari Libur'}</Button>}</header>

    {error && <Alert variant="danger" title="Kalender tidak dapat diproses" className="mb-4">{error}</Alert>}

    {canManage && showForm && <form onSubmit={onCreate} aria-busy={submitting} className="mb-5 grid gap-3 rounded-xl border border-border bg-paper p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm font-semibold text-foreground">Tanggal<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="input mt-1" /></label>
      <label className="text-sm font-semibold text-foreground">Nama<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input mt-1" placeholder="Nama hari libur" /></label>
      <label className="text-sm font-semibold text-foreground">Jenis<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as HolidayType, locationId: '' })} className="input mt-1"><option value="NATIONAL">Libur Nasional</option><option value="CUTI_BERSAMA">Cuti Bersama</option><option value="LOCATION_SPECIFIC">Khusus Lokasi</option></select></label>
      {form.type === 'LOCATION_SPECIFIC' ? <label className="text-sm font-semibold text-foreground">Lokasi<select required value={form.locationId} onChange={(event) => setForm({ ...form, locationId: event.target.value })} className="input mt-1"><option value="">Pilih lokasi</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label> : <div className="flex items-end"><p className="mb-2 text-caption text-muted">Berlaku untuk semua lokasi.</p></div>}
      <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4"><Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Batal</Button><Button type="submit" disabled={submitting || !form.name.trim()}>{submitting ? 'Menyimpan...' : 'Simpan Hari Libur'}</Button></div>
    </form>}

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="overflow-hidden rounded-xl border border-border bg-paper">
        <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5"><Button variant="ghost" size="sm" aria-label="Bulan sebelumnya" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="size-5" /></Button><h2 className="capitalize font-bold text-navy">{MONTH_FORMAT.format(month)}</h2><Button variant="ghost" size="sm" aria-label="Bulan berikutnya" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="size-5" /></Button></div>

        <div className="grid grid-cols-7 border-b bg-surface-subtle text-center text-xs font-bold uppercase tracking-wider text-muted">{WEEKDAYS.map((day) => <div key={day} className="py-2">{day}</div>)}</div>
        <div className="grid grid-cols-7 md:hidden">{days.map((day) => {
          const key = dateKey(day); const entries = holidaysByDate.get(key) ?? []; const inMonth = day.getMonth() === month.getMonth();
          return <button key={key} type="button" onClick={() => selectDay(day)} aria-label={localDate(key).toLocaleDateString('id-ID', { dateStyle: 'full' })} className={`relative grid aspect-square place-items-center border-b border-r text-xs ${key === selectedDate ? 'bg-brand font-bold text-white' : inMonth ? 'text-slate-700' : 'bg-slate-50 text-slate-300'}`}>{day.getDate()}{entries.length > 0 && <span className={`absolute bottom-1 size-1.5 rounded-full ${key === selectedDate ? 'bg-white' : 'bg-red-500'}`} />}</button>;
        })}</div>

        <div className="hidden grid-cols-7 md:grid">{days.map((day) => {
          const key = dateKey(day); const entries = holidaysByDate.get(key) ?? []; const inMonth = day.getMonth() === month.getMonth();
          return <button key={key} type="button" onClick={() => selectDay(day)} className={`min-h-28 border-b border-r p-2 text-left align-top transition-colors hover:bg-surface-subtle ${key === selectedDate ? 'bg-info-surface ring-2 ring-inset ring-brand' : ''} ${inMonth ? '' : 'bg-surface-subtle/70 text-muted'}`}><span className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${key === dateKey(now) ? 'bg-brand text-white' : ''}`}>{day.getDate()}</span><span className="mt-1 block space-y-1">{entries.slice(0, 2).map((holiday) => <span key={holiday.id} className={`block truncate rounded-md px-1.5 py-1 text-xs font-semibold ${holiday.type === 'LOCATION_SPECIFIC' ? 'bg-warning-surface text-warning' : 'bg-danger-surface text-danger'}`}>{holiday.name}</span>)}{entries.length > 2 && <span className="block text-xs font-semibold text-muted">+{entries.length - 2} lainnya</span>}</span></button>;
        })}</div>

        <div className="border-t p-4 md:hidden"><h3 className="text-sm font-bold text-navy">Daftar {MONTH_FORMAT.format(month)}</h3><div className="mt-3 space-y-2">{monthHolidays.length ? monthHolidays.map((holiday) => <HolidayItem key={holiday.id} holiday={holiday} canManage={canManage} onRemove={setPendingDelete} />) : <p className="rounded-xl bg-surface-subtle p-3 text-body text-muted">Tidak ada hari libur bulan ini.</p>}</div></div>
      </section>

      <aside className="h-fit rounded-xl border border-border bg-paper p-4 lg:sticky lg:top-24">
        <div className="flex items-center gap-2 text-brand"><CalendarDays className="size-5" /><p className="text-xs font-bold uppercase tracking-wider">Tanggal Terpilih</p></div>
        <h2 className="mt-2 font-bold text-navy">{localDate(selectedDate).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
        <div className="mt-4 space-y-3">{selectedHolidays.length ? selectedHolidays.map((holiday) => <HolidayItem key={holiday.id} holiday={holiday} canManage={canManage} onRemove={setPendingDelete} />) : <p className="rounded-xl bg-surface-subtle p-3 text-body text-muted">Tidak ada hari libur pada tanggal ini.</p>}</div>
        {canManage && !showForm && <Button variant="secondary" className="mt-4 w-full" onClick={openCreate}><Plus className="size-4" />Tambah pada tanggal ini</Button>}
      </aside>
    </div>
    <ActionDialog open={!!pendingDelete} title="Hapus hari libur?" description={pendingDelete ? `${pendingDelete.name} akan dihapus dari kalender operasional.` : ''} confirmLabel="Hapus Hari Libur" danger busy={deleting} onClose={() => setPendingDelete(null)} onConfirm={remove} />
  </DossierPage>;
}

function HolidayItem({ holiday, canManage, onRemove }: { holiday: HolidayRow; canManage: boolean; onRemove: (holiday: HolidayRow) => void }) {
  return <article className="rounded-xl border border-border bg-surface p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold text-navy [overflow-wrap:anywhere]">{holiday.name}</p><div className="mt-2 flex flex-wrap gap-1.5"><Badge variant={holiday.type === 'LOCATION_SPECIFIC' ? 'warning' : 'danger'}>{TYPE_LABEL[holiday.type]}</Badge>{holiday.location && <Badge><MapPin className="mr-1 size-3" /><span className="break-words [overflow-wrap:anywhere]">{holiday.location.name}</span></Badge>}</div><p className="mt-2 text-caption tabular-nums text-muted">{localDate(dateKey(holiday.date)).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>{canManage && <button type="button" aria-label={`Hapus ${holiday.name}`} onClick={() => onRemove(holiday)} className="grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger-surface hover:text-danger"><Trash2 className="size-4" /></button>}</div></article>;
}
