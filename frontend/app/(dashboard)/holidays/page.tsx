'use client';

import { useEffect, useState, FormEvent } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';

interface HolidayRow {
  id: string;
  date: string;
  name: string;
  type: string;
  location?: { name: string } | null;
}

const TYPE_LABEL: Record<string, string> = {
  NATIONAL: 'Libur Nasional',
  CUTI_BERSAMA: 'Cuti Bersama',
  LOCATION_SPECIFIC: 'Khusus Lokasi',
};

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ date: '', name: '', type: 'NATIONAL' });

  async function load() {
    try {
      const data = await apiFetch<HolidayRow[]>('/holidays', { token: getToken() });
      setHolidays(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat data hari libur');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/holidays', { method: 'POST', token: getToken(), body: form });
      setForm({ date: '', name: '', type: 'NATIONAL' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menambah hari libur');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await apiFetch(`/holidays/${id}`, { method: 'DELETE', token: getToken() });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menghapus hari libur');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Hari Libur & Kalender</h1>
        <button onClick={() => setShowForm((s) => !s)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
          {showForm ? 'Batal' : '+ Tambah Hari Libur'}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={onCreate} className="mb-6 grid max-w-md gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="text-sm">
            Tanggal
            <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <input required placeholder="Nama hari libur" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="NATIONAL">Libur Nasional</option>
            <option value="CUTI_BERSAMA">Cuti Bersama</option>
          </select>
          <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
            {submitting ? 'Menyimpan...' : 'Simpan'}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Tanggal</th>
              <th className="px-4 py-2">Nama</th>
              <th className="px-4 py-2">Jenis</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((h) => (
              <tr key={h.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{new Date(h.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</td>
                <td className="px-4 py-2">{h.name}</td>
                <td className="px-4 py-2">{TYPE_LABEL[h.type] ?? h.type}{h.location ? ` (${h.location.name})` : ''}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => remove(h.id)} className="text-red-500 hover:text-red-700">Hapus</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
