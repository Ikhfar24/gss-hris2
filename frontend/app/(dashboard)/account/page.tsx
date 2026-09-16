'use client';

import { FormEvent, useState } from 'react';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, ApiError } from '@/lib/api';
import { saveSession, type SessionUser } from '@/lib/auth';
import { useSession } from '@/components/providers/SessionProvider';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/forms';

interface AccountResponse { user: SessionUser }

export default function AccountPage() {
  const { session, refresh } = useSession();
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmation: '' });
  const [email, setEmail] = useState({ currentPassword: '', email: session.email });
  const [busy, setBusy] = useState<'password' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (passwords.newPassword !== passwords.confirmation) return setError('Konfirmasi password baru tidak cocok');
    setBusy('password'); setError(null);
    try {
      const response = await apiFetch<AccountResponse>('/auth/account/password', { method: 'PATCH', body: { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword } });
      saveSession(response.user); setPasswords({ currentPassword: '', newPassword: '', confirmation: '' }); refresh(); toast.success('Password berhasil diperbarui');
    } catch (value) { setError(value instanceof ApiError ? value.message : 'Gagal memperbarui password'); }
    finally { setBusy(null); }
  }

  async function changeEmail(event: FormEvent) {
    event.preventDefault(); setBusy('email'); setError(null);
    try {
      const response = await apiFetch<AccountResponse>('/auth/account/email', { method: 'PATCH', body: email });
      saveSession(response.user); setEmail({ currentPassword: '', email: response.user.email }); refresh(); toast.success('Email login berhasil diperbarui');
    } catch (value) { setError(value instanceof ApiError ? value.message : 'Gagal memperbarui email'); }
    finally { setBusy(null); }
  }

  return <div className="mx-auto max-w-5xl">
    <div className="mb-7 flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand text-white"><ShieldCheck /></span><div className="min-w-0"><p className="text-caption font-bold uppercase tracking-[0.12em] text-brand">Keamanan akun</p><h1 className="mt-1 break-words text-page-title text-brand [overflow-wrap:anywhere]">Kredensial dan email login</h1><p className="mt-1 text-body text-muted">Perubahan sensitif selalu memerlukan password Anda saat ini.</p></div></div>
    {session.mustChangePassword && <Alert variant="danger" className="mb-5">Password ini dibuat sementara oleh administrator. Buat password pribadi sebelum membuka modul lain.</Alert>}
    {error && <Alert variant="danger" className="mb-5">{error}</Alert>}
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><KeyRound className="text-brand" /><div><h2 className="font-semibold text-brand">Ubah password</h2><p className="text-caption text-muted">Minimal 12 karakter dan berbeda dari sebelumnya.</p></div></div><form onSubmit={changePassword} aria-busy={busy === 'password'} className="space-y-4"><div><Label htmlFor="account-current-password">Password saat ini</Label><Input id="account-current-password" required minLength={8} type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></div><div><Label htmlFor="account-new-password">Password baru</Label><Input id="account-new-password" required minLength={12} type="password" autoComplete="new-password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /></div><div><Label htmlFor="account-password-confirmation">Konfirmasi password baru</Label><Input id="account-password-confirmation" required minLength={12} type="password" autoComplete="new-password" value={passwords.confirmation} onChange={(event) => setPasswords({ ...passwords, confirmation: event.target.value })} /></div><Button disabled={!!busy} className="w-full">{busy === 'password' ? 'Menyimpan...' : 'Perbarui password'}</Button></form></Card>
      <Card className="p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><Mail className="text-brand" /><div><h2 className="font-semibold text-brand">Ubah email login</h2><p className="text-caption text-muted">Email dinormalisasi dan harus unik.</p></div></div><Alert variant="warning" className="mb-4">Verifikasi email belum tersedia. Perubahan dilindungi dengan password saat ini, rotasi sesi, dan audit aktivitas.</Alert><form onSubmit={changeEmail} aria-busy={busy === 'email'} className="space-y-4"><div><Label htmlFor="account-email">Email baru</Label><Input id="account-email" required type="email" autoComplete="email" value={email.email} onChange={(event) => setEmail({ ...email, email: event.target.value })} /></div><div><Label htmlFor="account-email-password">Password saat ini</Label><Input id="account-email-password" required minLength={8} type="password" autoComplete="current-password" value={email.currentPassword} onChange={(event) => setEmail({ ...email, currentPassword: event.target.value })} /></div><Button disabled={!!busy} variant="secondary" className="w-full">{busy === 'email' ? 'Menyimpan...' : 'Perbarui email'}</Button></form></Card>
    </div>
  </div>;
}
