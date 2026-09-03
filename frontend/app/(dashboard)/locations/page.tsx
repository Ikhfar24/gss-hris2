'use client';

import { useEffect, useState, FormEvent } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';

interface ClientOption {
  id: string;
  name: string;
}

interface LocationRow {
  id: string;
  name: string;
  address?: string | null;
  radiusMeters: number;
  checkInTime: string;
  checkOutTime: string;
  toleranceMin: number;
  client?: { id: string; name: string } | null;
  isActive: boolean;
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    address: '',
    radiusMeters: 300,
    checkInTime: '08:00',
    checkOutTime: '16:00',
    toleranceMin: 10,
    clientId: '',
  });

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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/locations', {
        method: 'POST',
        token: getToken(),
        body: { ...form, clientId: form.clientId || undefined },
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuat lokasi');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lokasi Kerja</h1>
        <button onClick={() => setShowForm((s) => !s)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
          {showForm ? 'Batal' : '+ Tambah Lokasi'}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={onCreate} className="mb-6 grid max-w-xl gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <input required placeholder="Nama lokasi" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Alamat" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">-- Tanpa client --</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Radius (meter)
              <input type="number" min={50} value={form.radiusMeters} onChange={(e) => setForm({ ...form, radiusMeters: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              Toleransi (menit)
              <input type="number" min={0} value={form.toleranceMin} onChange={(e) => setForm({ ...form, toleranceMin: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              Jam masuk
              <input type="time" value={form.checkInTime} onChange={(e) => setForm({ ...form, checkInTime: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              Jam pulang
              <input type="time" value={form.checkOutTime} onChange={(e) => setForm({ ...form, checkOutTime: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
          </div>
          <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
            {submitting ? 'Menyimpan...' : 'Simpan Lokasi'}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Nama</th>
              <th className="px-4 py-2">Client</th>
              <th className="px-4 py-2">Radius</th>
              <th className="px-4 py-2">Jam Kerja</th>
              <th className="px-4 py-2">Toleransi</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{l.name}</td>
                <td className="px-4 py-2">{l.client?.name ?? '-'}</td>
                <td className="px-4 py-2">{l.radiusMeters}m</td>
                <td className="px-4 py-2">{l.checkInTime}–{l.checkOutTime}</td>
                <td className="px-4 py-2">{l.toleranceMin} menit</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
