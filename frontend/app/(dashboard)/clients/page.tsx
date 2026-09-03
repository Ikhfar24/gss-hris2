'use client';

import { useEffect, useState, FormEvent } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';

interface ClientRow {
  id: string;
  name: string;
  address?: string | null;
  contactPerson?: string | null;
  contactPhone?: string | null;
  isActive: boolean;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', contactPerson: '', contactPhone: '' });

  async function load() {
    try {
      const data = await apiFetch<ClientRow[]>('/clients', { token: getToken() });
      setClients(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat data client');
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
      await apiFetch('/clients', { method: 'POST', token: getToken(), body: form });
      setForm({ name: '', address: '', contactPerson: '', contactPhone: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuat client');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Client</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
        >
          {showForm ? 'Batal' : '+ Tambah Client'}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={onCreate} className="mb-6 grid max-w-xl gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <input required placeholder="Nama client" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Alamat" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Contact person" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="No. telepon" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
            {submitting ? 'Menyimpan...' : 'Simpan Client'}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Nama</th>
              <th className="px-4 py-2">Alamat</th>
              <th className="px-4 py-2">Contact</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2">{c.address ?? '-'}</td>
                <td className="px-4 py-2">{c.contactPerson ?? '-'} {c.contactPhone ? `(${c.contactPhone})` : ''}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {c.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
