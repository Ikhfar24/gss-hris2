'use client';

import { useEffect, useState, FormEvent } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';

interface CompanySettings {
  companyName: string;
  appName: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  email?: string | null;
  address?: string | null;
  primaryColor?: string | null;
}

export default function SettingsPage() {
  const [form, setForm] = useState<CompanySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<CompanySettings>('/company-settings').then(setForm).catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSaved(false);
    try {
      const token = getToken();
      await apiFetch('/company-settings', { method: 'PATCH', token, body: form });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan pengaturan');
    }
  }

  if (!form) return <p className="text-sm text-slate-500">Memuat...</p>;

  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">Company Settings</h1>
      <p className="mb-4 text-sm text-slate-500">
        Identitas perusahaan dapat diganti di sini tanpa mengubah source code (PRD §18).
      </p>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <Field label="Nama Perusahaan" value={form.companyName} onChange={(v) => setForm({ ...form, companyName: v })} />
        <Field label="Nama Aplikasi" value={form.appName} onChange={(v) => setForm({ ...form, appName: v })} />
        <Field label="Email" value={form.email ?? ''} onChange={(v) => setForm({ ...form, email: v })} />
        <Field label="Alamat" value={form.address ?? ''} onChange={(v) => setForm({ ...form, address: v })} />
        <Field label="Logo URL" value={form.logoUrl ?? ''} onChange={(v) => setForm({ ...form, logoUrl: v })} />
        <Field label="Warna Utama" value={form.primaryColor ?? ''} onChange={(v) => setForm({ ...form, primaryColor: v })} />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">Pengaturan disimpan.</p>}

        <button type="submit" className="rounded-lg bg-slate-900 py-2 text-sm text-white hover:bg-slate-800">
          Simpan
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}
