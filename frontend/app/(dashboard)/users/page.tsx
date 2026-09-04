'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

type UserRow = { id: string; name: string; email: string; role: string; isActive: boolean; employeeId?: string | null; employee?: { name: string; employeeNumber: string | null } | null };
type UserResponse = { data: UserRow[]; meta: { total: number } };
const ROLES = ['KARYAWAN', 'KOORDINATOR', 'ADMIN_HR', 'KEUANGAN', 'MARKETING', 'DIREKTUR', 'KOMISARIS', 'SYSTEM_ADMIN'];

export default function UsersPage() {
  const [data, setData] = useState<UserResponse>({ data: [], meta: { total: 0 } });
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'KARYAWAN', employeeId: '' });
  const [editing, setEditing] = useState<UserRow | null>(null);

  async function load() {
    try { setData(await apiFetch<UserResponse>(`/users?search=${encodeURIComponent(search)}`)); } catch (err) { setError(err instanceof ApiError ? err.message : 'Gagal memuat user'); }
  }
  useEffect(() => { load(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault(); setError(null);
    try { await apiFetch('/users', { method: 'POST', body: { ...form, employeeId: form.employeeId || undefined } }); setForm({ name: '', email: '', password: '', role: 'KARYAWAN', employeeId: '' }); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : 'Gagal membuat user'); }
  }
  async function saveEdit(event: FormEvent) {
    event.preventDefault(); if (!editing) return;
    const reason = window.prompt('Alasan wajib untuk perubahan role/status/tautan akun bila ada:') ?? '';
    try { await apiFetch(`/users/${editing.id}`, { method: 'PATCH', body: { name: editing.name, email: editing.email, role: editing.role, employeeId: editing.employeeId, reason: reason || undefined } }); setEditing(null); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : 'Gagal memperbarui user'); }
  }
  async function lifecycle(user: UserRow, action: 'deactivate' | 'reactivate' | 'delete') {
    const reason = window.prompt(`Alasan ${action === 'delete' ? 'hapus aman' : action === 'deactivate' ? 'nonaktifkan' : 'aktifkan'} akun:`);
    if (!reason) return;
    if (action === 'delete' && !window.confirm('Hapus hanya bila akun benar-benar tanpa riwayat. Lanjutkan?')) return;
    try { await apiFetch(`/users/${user.id}${action === 'delete' ? '' : `/${action}`}`, { method: action === 'delete' ? 'DELETE' : 'PATCH', body: { reason } }); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : 'Aksi user gagal'); }
  }

  return <div>
    <h1 className="mb-4 text-2xl font-semibold">Manajemen User</h1>
    {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
    <form onSubmit={create} className="mb-5 grid max-w-3xl gap-2 rounded-xl border bg-white p-4 sm:grid-cols-2">
      <input required placeholder="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded border p-2 text-sm" />
      <input required type="email" placeholder="Email login" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded border p-2 text-sm" />
      <input required minLength={8} type="password" placeholder="Password sementara" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded border p-2 text-sm" />
      <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded border p-2 text-sm">{ROLES.map((role) => <option key={role}>{role}</option>)}</select>
      <input placeholder="ID profil karyawan (opsional)" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="rounded border p-2 text-sm sm:col-span-2" />
      <button className="rounded bg-slate-900 p-2 text-sm text-white sm:col-span-2">Tambah User</button>
    </form>
    <div className="mb-3 flex gap-2"><input placeholder="Cari nama atau email" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded border p-2 text-sm" /><button onClick={load} className="rounded border px-3 text-sm">Cari</button><span className="self-center text-xs text-slate-500">{data.meta.total} user</span></div>
    {editing && <form onSubmit={saveEdit} className="mb-4 grid max-w-2xl gap-2 rounded border bg-slate-50 p-3 sm:grid-cols-2"><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="rounded border p-2 text-sm" /><input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className="rounded border p-2 text-sm" /><select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })} className="rounded border p-2 text-sm">{ROLES.map((role) => <option key={role}>{role}</option>)}</select><input placeholder="ID profil karyawan; kosongkan untuk lepas tautan" value={editing.employeeId ?? ''} onChange={(e) => setEditing({ ...editing, employeeId: e.target.value || null })} className="rounded border p-2 text-sm" /><button className="rounded bg-slate-900 p-2 text-sm text-white sm:col-span-2">Simpan Edit</button></form>}
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3">Nama</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead><tbody>{data.data.map((user) => <tr key={user.id} className="border-t"><td className="p-3">{user.name}<div className="text-xs text-slate-500">{user.employee?.employeeNumber ?? 'Tanpa profil karyawan'}</div></td><td>{user.email}</td><td>{user.role}</td><td>{user.isActive ? 'Aktif' : 'Nonaktif'}</td><td className="space-x-2 p-3 text-right"><button onClick={() => setEditing(user)} className="underline">Edit</button><button onClick={() => lifecycle(user, user.isActive ? 'deactivate' : 'reactivate')} className="underline">{user.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button><button onClick={() => lifecycle(user, 'delete')} className="text-red-700 underline">Hapus</button></td></tr>)}</tbody></table></div>
  </div>;
}
