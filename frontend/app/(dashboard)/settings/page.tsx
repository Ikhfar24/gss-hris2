'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useSession } from '@/components/providers/SessionProvider';
import { Alert, LoadingState } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { ContextBand, DossierPage, WorkSheet } from '@/components/ui/dossier';
import { PageHeader } from '@/components/ui/page-header';

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
  const router = useRouter();
  const { session } = useSession();
  const [form, setForm] = useState<CompanySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session.role !== 'SYSTEM_ADMIN') {
      router.replace('/dashboard');
      return;
    }
    apiFetch<CompanySettings>('/company-settings').then(setForm).catch((err) => setError(err instanceof ApiError ? err.message : 'Gagal memuat pengaturan'));
  }, [router, session.role]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const token = getToken();
      await apiFetch('/company-settings', { method: 'PATCH', token, body: {
        ...form,
        logoUrl: form.logoUrl?.trim() || null,
        faviconUrl: form.faviconUrl?.trim() || null,
      } });
      setSaved(true);
      window.dispatchEvent(new Event('branding-updated'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  }

  if (session.role !== 'SYSTEM_ADMIN') return <LoadingState label="Memverifikasi akses pengaturan"><div className="h-32 animate-pulse rounded-2xl bg-surface-subtle" /></LoadingState>;
  if (error && !form) return <div><PageHeader title="Company Settings" /><Alert variant="danger" title="Pengaturan tidak dapat dimuat">{error}</Alert><Button onClick={() => window.location.reload()} variant="secondary" className="mt-4">Coba lagi</Button></div>;
  if (!form) return <LoadingState label="Memuat pengaturan perusahaan"><div className="h-96 animate-pulse rounded-2xl bg-surface-subtle" /></LoadingState>;

  return (
    <DossierPage className="max-w-3xl space-y-5">
      <ContextBand className="mb-0 border border-border bg-paper px-4 py-4 text-foreground shadow-none sm:px-5 [&_h1]:text-brand [&_.text-white\/70]:text-muted [&_.text-white\/72]:text-muted" title="Company Settings" description="Identitas perusahaan dapat diganti tanpa mengubah source code (PRD §18)." meta={<span>IDENTITAS & BRANDING</span>} />

      <WorkSheet className="border border-border shadow-none" title="Konfigurasi Branding"><form onSubmit={onSubmit} aria-busy={saving} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama Perusahaan" value={form.companyName} onChange={(v) => setForm({ ...form, companyName: v })} />
        <Field label="Nama Aplikasi" value={form.appName} onChange={(v) => setForm({ ...form, appName: v })} />
        <Field label="Email" value={form.email ?? ''} onChange={(v) => setForm({ ...form, email: v })} />
        <Field label="Alamat" value={form.address ?? ''} onChange={(v) => setForm({ ...form, address: v })} />
        <Field label="Path Logo (contoh: /branding/logo.svg)" value={form.logoUrl ?? ''} onChange={(v) => setForm({ ...form, logoUrl: v })} />
        <Field label="Path Favicon (contoh: /branding/favicon.ico)" value={form.faviconUrl ?? ''} onChange={(v) => setForm({ ...form, faviconUrl: v })} />
        <Field label="Warna Utama" value={form.primaryColor ?? ''} onChange={(v) => setForm({ ...form, primaryColor: v })} />

        {error && <Alert variant="danger" title="Perubahan tidak tersimpan" className="sm:col-span-2">{error}</Alert>}
        {saved && <Alert variant="success" title="Pengaturan disimpan" className="sm:col-span-2">Branding terbaru telah diterapkan.</Alert>}

        <Button type="submit" disabled={saving} className="w-full sm:col-span-2 sm:w-auto sm:justify-self-end">{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</Button>
      </form></WorkSheet>
    </DossierPage>
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
    <label className="block text-sm font-semibold text-foreground">
      <span className="mb-1 block">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input w-full"
      />
    </label>
  );
}
