'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { useSession } from '@/components/providers/SessionProvider';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  ActionMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ContextBand, DataRegion, DossierPage, MobileRecord, RecordActions, RecordBody, RecordHeader, WorkSheet } from '@/components/ui/dossier';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { Input, Label, Select, Textarea } from '@/components/ui/forms';

type TemporaryStatus = { available: boolean; purpose?: string; createdAt?: string; lastRevealedAt?: string | null; revealCount?: number };
type UserRow = { id: string; name: string; email: string; role: string; isActive: boolean; employeeId?: string | null; employee?: { name: string; employeeNumber: string | null } | null; temporaryCredential?: TemporaryStatus };
type UserResponse = { data: UserRow[]; meta: { total: number } };
type EmployeeOption = { id: string; name: string; employeeNumber: string | null };
type CoordinatorScope = { id: string; coordinatorUserId: string; employmentType: 'TENAGA_BORONGAN' | 'TENAGA_ARSIPARIS' | 'STAFF_OFFICE'; active: boolean; coordinator: { id: string; name: string; email: string; role: string; isActive: boolean } };
type LifecycleAction = { user: UserRow; action: 'deactivate' | 'reactivate' | 'delete'; reason: string };
type CredentialAction = { user: UserRow; mode: 'reset' | 'reveal' };

const ROLES = ['KARYAWAN', 'KOORDINATOR', 'ADMIN_HR', 'KEUANGAN', 'MARKETING', 'DIREKTUR', 'KOMISARIS', 'SYSTEM_ADMIN'];
const ROLE_LABELS: Record<string, string> = { KARYAWAN: 'Karyawan', KOORDINATOR: 'Koordinator', ADMIN_HR: 'Admin HR', KEUANGAN: 'Keuangan', MARKETING: 'Marketing', DIREKTUR: 'Direktur', KOMISARIS: 'Komisaris', SYSTEM_ADMIN: 'System Admin' };
const SCOPE_TYPES = [
  { value: 'TENAGA_BORONGAN', label: 'Tenaga Borongan' },
  { value: 'TENAGA_ARSIPARIS', label: 'Tenaga Arsiparis' },
  { value: 'STAFF_OFFICE', label: 'Staff Kantor' },
] as const;

export default function UsersPage() {
  const searchParams = useSearchParams();
  const { session } = useSession();
  const canManageScopes = ['ADMIN_HR', 'SYSTEM_ADMIN'].includes(session.role);
  const canManageUsers = ['ADMIN_HR', 'SYSTEM_ADMIN'].includes(session.role);
  const assignableRoles = session.role === 'SYSTEM_ADMIN' ? ROLES : ROLES.filter((role) => role !== 'SYSTEM_ADMIN');
  const [data, setData] = useState<UserResponse>({ data: [], meta: { total: 0 } });
  const [scopes, setScopes] = useState<CoordinatorScope[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'KARYAWAN', employeeId: searchParams.get('employeeId') ?? '' });
  const [scopeForm, setScopeForm] = useState({ userId: '', employmentType: 'TENAGA_BORONGAN' as CoordinatorScope['employmentType'] });
  const [editing, setEditing] = useState<(UserRow & { reason: string }) | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction | null>(null);
  const [credentialAction, setCredentialAction] = useState<CredentialAction | null>(null);
  const [credentialForm, setCredentialForm] = useState({ reason: '', currentPassword: '' });
  const [revealed, setRevealed] = useState<string | null>(null);
  const [credentialBusy, setCredentialBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      const users = await apiFetch<UserResponse>(`/users?search=${encodeURIComponent(search)}`);
      setData(users);
      if (canManageScopes) setScopes(await apiFetch<CoordinatorScope[]>('/coordinator-scopes'));
      if (canManageUsers) {
        const response = await apiFetch<{ data: EmployeeOption[] }>('/employees?linked=false&pageSize=100&sort=name&direction=asc');
        setEmployees(response.data);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat user');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await apiFetch('/users', { method: 'POST', body: { ...form, employeeId: form.employeeId || undefined } });
      setForm({ name: '', email: '', role: 'KARYAWAN', employeeId: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuat user');
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    try {
      await apiFetch(`/users/${editing.id}`, { method: 'PATCH', body: { name: editing.name, email: editing.email, role: editing.role, employeeId: editing.employeeId, reason: editing.reason || undefined } });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memperbarui user');
    }
  }

  async function lifecycle(event: FormEvent) {
    event.preventDefault();
    if (!lifecycleAction) return;
    const { user, action, reason } = lifecycleAction;
    try {
      await apiFetch(`/users/${user.id}${action === 'delete' ? '' : `/${action}`}`, { method: action === 'delete' ? 'DELETE' : 'PATCH', body: { reason } });
      setLifecycleAction(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Aksi user gagal');
    }
  }

  async function setScope(active: boolean, userId = scopeForm.userId, employmentType = scopeForm.employmentType) {
    if (!userId.trim()) {
      setError('ID User Koordinator wajib diisi');
      return;
    }
    setError(null);
    try {
      await apiFetch(`/coordinator-scopes/${encodeURIComponent(userId.trim())}/${employmentType}`, { method: 'PATCH', body: { active } });
      setScopeForm({ ...scopeForm, userId: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memperbarui cakupan koordinator');
    }
  }

  function canManageCredential(user: UserRow) {
    if (!canManageUsers || user.id === session.id) return false;
    return session.role === 'SYSTEM_ADMIN' || !['ADMIN_HR', 'SYSTEM_ADMIN'].includes(user.role);
  }

  async function submitCredential(event: FormEvent) {
    event.preventDefault();
    if (!credentialAction) return;
    setCredentialBusy(true);
    setError(null);
    try {
      if (credentialAction.mode === 'reset') {
        await apiFetch(`/users/${credentialAction.user.id}/reset-password`, { method: 'POST', body: credentialForm });
        setCredentialAction(null);
        setCredentialForm({ reason: '', currentPassword: '' });
        await load();
      } else {
        const response = await apiFetch<{ password: string }>(`/users/${credentialAction.user.id}/temporary-credential/reveal`, { method: 'POST', body: credentialForm });
        setRevealed(response.password);
        await load();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Aksi kredensial gagal');
    } finally {
      setCredentialBusy(false);
    }
  }

  function openCredential(user: UserRow, mode: CredentialAction['mode']) {
    setRevealed(null);
    setCredentialAction({ user, mode });
  }

  const actionProps = { canManageUsers, canManageCredential, onEdit: (user: UserRow) => setEditing({ ...user, reason: '' }), onLifecycle: (user: UserRow, action: LifecycleAction['action']) => setLifecycleAction({ user, action, reason: '' }), onCredential: openCredential };

  return <DossierPage className="space-y-3">
    <ContextBand className="mb-0 rounded-none border-x-0 border-t-0 bg-transparent px-0 py-3 shadow-none" title="Manajemen User" description="Kelola identitas akun, akses, tautan karyawan, dan kredensial sementara." meta={<span>{session.role === 'SYSTEM_ADMIN' ? 'OTORITAS SISTEM' : 'OTORITAS ADMIN HR'}</span>} />
    {error && <Alert variant="danger" title="Akun tidak dapat diproses">{error}</Alert>}

    {canManageUsers && <details className="rounded-xl border border-border bg-paper px-4 py-3"><summary className="cursor-pointer text-sm font-semibold text-brand">Buat akun baru</summary><WorkSheet className="mt-3 border-0 shadow-none [&>div:first-child]:py-2.5 [&>div:last-child]:p-3" title="Buat Akun" description="Hubungkan akun ke profil karyawan bila layanan personal diperlukan.">
      <form onSubmit={create} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1.2fr_0.8fr_1.2fr_auto] xl:items-end">
        <label className="text-sm font-semibold text-foreground">Nama<Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1" /></label>
        <label className="text-sm font-semibold text-foreground">Email login<Input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1" /></label>
        <label className="text-sm font-semibold text-foreground">Role<Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="mt-1">{assignableRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role] ?? role}</option>)}</Select></label>
        <label className="text-sm font-semibold text-foreground">Profil karyawan<Select value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} className="mt-1"><option value="">Tanpa profil karyawan</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.employeeNumber ?? 'Tanpa NIP'}</option>)}</Select></label>
        <p className="text-caption text-muted sm:col-span-2 xl:col-span-4">Password kuat dibuat oleh server dan hanya tersedia melalui proses reveal yang diaudit.</p>
        <Button className="w-full sm:col-span-2 sm:w-auto xl:col-span-1 xl:col-start-5 xl:row-start-1">Tambah User</Button>
      </form>
    </WorkSheet></details>}

    {canManageScopes && <details className="rounded-xl border border-border bg-paper px-4 py-3"><summary className="cursor-pointer text-sm font-semibold text-brand">Kelola cakupan Koordinator</summary><WorkSheet className="mt-3 border-0 shadow-none [&>div:first-child]:py-2.5 [&>div:last-child]:p-3" id="coordinator-scopes" title="Cakupan Koordinator" description="Scope aktif terpisah dari role User dan berlaku untuk jenis tenaga yang dipilih.">
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(14rem,1fr)_minmax(12rem,0.7fr)_auto_auto]">
        <label className="min-w-0 text-sm font-semibold text-foreground">User Koordinator<Select required value={scopeForm.userId} onChange={(event) => setScopeForm({ ...scopeForm, userId: event.target.value })} className="mt-1"><option value="">Pilih User Koordinator</option>{data.data.filter((user) => user.role === 'KOORDINATOR' && user.isActive).map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</Select></label>
        <label className="min-w-0 text-sm font-semibold text-foreground">Jenis tenaga<Select value={scopeForm.employmentType} onChange={(event) => setScopeForm({ ...scopeForm, employmentType: event.target.value as CoordinatorScope['employmentType'] })} className="mt-1">{SCOPE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</Select></label>
        <Button type="button" onClick={() => void setScope(true)}>Tetapkan</Button>
        <Button type="button" variant="danger" onClick={() => void setScope(false)}>Cabut</Button>
      </div>
      <div className="mt-3 divide-y divide-border border-t border-border">
        {scopes.filter((scope) => scope.active).map((scope) => <div key={scope.id} className="flex min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="break-words font-semibold text-brand [overflow-wrap:anywhere]">{scope.coordinator.name}</p><p className="break-all text-caption text-muted">{scope.coordinator.email}</p></div><Badge className="self-start sm:self-auto">{SCOPE_TYPES.find((type) => type.value === scope.employmentType)?.label}</Badge><Button size="sm" variant="danger" type="button" onClick={() => void setScope(false, scope.coordinatorUserId, scope.employmentType)}>Cabut</Button></div>)}
        {scopes.filter((scope) => scope.active).length === 0 && <p className="py-5 text-center text-body text-muted">Belum ada cakupan aktif.</p>}
      </div>
    </WorkSheet></details>}

    <WorkSheet className="shadow-none [&>div:first-child]:py-2.5 [&>div:last-child]:p-3" title="Daftar Akun" description="Identitas akun menjadi acuan utama; akses dan kredensial ditampilkan sebagai kondisi terpisah.">
      <div className="mb-3 flex min-w-0 flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm font-semibold text-foreground">Cari user<Input placeholder="Nama atau email" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1" /></label>
        <Button type="button" variant="secondary" onClick={() => void load()}>Cari</Button>
        <span className="text-caption tabular-nums text-muted sm:pb-2.5">{data.meta.total} user</span>
      </div>
      {data.data.length === 0 ? <EmptyState title="User tidak ditemukan" description="Ubah pencarian atau buat akun baru." /> : <>
        <div className="space-y-3 md:hidden">{data.data.map((user) => <UserMobileRecord key={user.id} user={user} {...actionProps} />)}</div>
        <DataRegion className="hidden overflow-visible md:block">
          <table className="table-fixed text-sm">
            <thead><tr><th className="w-[27%]">Identitas user</th><th className="w-[17%]">Akses</th><th className="w-[22%]">Profil karyawan</th><th className="w-[21%]">Kredensial</th><th className="w-[13%] text-right">Tindakan</th></tr></thead>
            <tbody>{data.data.map((user) => <UserDesktopRow key={user.id} user={user} {...actionProps} />)}</tbody>
          </table>
        </DataRegion>
      </>}
    </WorkSheet>

    <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}><DialogContent><DialogTitle>Kelola Akun</DialogTitle><DialogDescription>Perbarui identitas dan tautan profil {editing?.name}. Perubahan sensitif tetap memerlukan alasan.</DialogDescription>{editing && <form onSubmit={saveEdit} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Nama<Input required value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="mt-1" /></label><label className="text-sm font-semibold">Email<Input required type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} className="mt-1" /></label><label className="text-sm font-semibold">Role<Select value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value })} className="mt-1">{assignableRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role] ?? role}</option>)}</Select></label><label className="text-sm font-semibold">Profil karyawan<Select value={editing.employeeId ?? ''} onChange={(event) => setEditing({ ...editing, employeeId: event.target.value || null })} className="mt-1"><option value="">Tanpa profil karyawan</option>{editing.employee && editing.employeeId && <option value={editing.employeeId}>{editing.employee.name} · {editing.employee.employeeNumber ?? 'Tanpa NIP'}</option>}{employees.filter((employee) => employee.id !== editing.employeeId).map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.employeeNumber ?? 'Tanpa NIP'}</option>)}</Select></label><label className="text-sm font-semibold sm:col-span-2">Alasan perubahan<Textarea value={editing.reason} onChange={(event) => setEditing({ ...editing, reason: event.target.value })} className="mt-1" placeholder="Wajib untuk perubahan role atau tautan karyawan" /></label><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Batal</Button><Button>Simpan perubahan</Button></div></form>}</DialogContent></Dialog>

    <Dialog open={!!lifecycleAction} onOpenChange={(open) => !open && setLifecycleAction(null)}><DialogContent><DialogTitle>{lifecycleAction?.action === 'delete' ? 'Hapus akun tanpa riwayat' : lifecycleAction?.action === 'deactivate' ? 'Nonaktifkan akun' : 'Aktifkan akun'}</DialogTitle><DialogDescription>{lifecycleAction?.action === 'delete' ? 'Penghapusan akan ditolak bila akun memiliki riwayat terlindungi. Gunakan nonaktifkan akun untuk mempertahankan histori.' : `Tindakan ini mengubah akses login ${lifecycleAction?.user.name ?? ''}.`}</DialogDescription><form onSubmit={lifecycle} className="mt-5 space-y-4"><div><Label>Alasan</Label><Textarea required minLength={3} value={lifecycleAction?.reason ?? ''} onChange={(event) => lifecycleAction && setLifecycleAction({ ...lifecycleAction, reason: event.target.value })} /></div><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setLifecycleAction(null)}>Batal</Button><Button variant={lifecycleAction?.action === 'delete' ? 'danger' : 'primary'}>{lifecycleAction?.action === 'delete' ? 'Hapus Aman' : 'Konfirmasi'}</Button></div></form></DialogContent></Dialog>

    <Dialog open={!!credentialAction} onOpenChange={(open) => { if (!open) { setCredentialAction(null); setCredentialForm({ reason: '', currentPassword: '' }); setRevealed(null); } }}><DialogContent><DialogTitle>{credentialAction?.mode === 'reset' ? 'Reset password sementara' : 'Lihat kredensial sementara'}</DialogTitle><DialogDescription>Tindakan untuk {credentialAction?.user.name} ini sensitif, memerlukan reautentikasi, dan dicatat di audit log.</DialogDescription>{revealed ? <div className="mt-5"><Label>Password sementara</Label><div className="break-all rounded-xl border border-amber-200 bg-amber-50 p-4 font-mono text-lg font-bold text-navy">{revealed}</div><p className="mt-2 text-xs text-slate-500">Tampilkan hanya kepada pemilik akun melalui kanal tepercaya. Password sementara tetap dapat dilihat kembali oleh HR sampai pemilik akun berhasil menggantinya.</p><Button className="mt-4 w-full" type="button" onClick={() => navigator.clipboard.writeText(revealed)}>Salin password</Button></div> : <form onSubmit={submitCredential} className="mt-5 space-y-4"><div><Label>Alasan</Label><Textarea required minLength={3} value={credentialForm.reason} onChange={(event) => setCredentialForm({ ...credentialForm, reason: event.target.value })} /></div><div><Label>Password admin saat ini</Label><Input required minLength={8} type="password" autoComplete="current-password" value={credentialForm.currentPassword} onChange={(event) => setCredentialForm({ ...credentialForm, currentPassword: event.target.value })} /></div><Button disabled={credentialBusy} variant={credentialAction?.mode === 'reset' ? 'danger' : 'primary'} className="w-full">{credentialBusy ? 'Memverifikasi...' : credentialAction?.mode === 'reset' ? 'Reset password' : 'Lihat password sementara'}</Button></form>}</DialogContent></Dialog>
  </DossierPage>;
}

type UserActionsProps = {
  user: UserRow;
  canManageUsers: boolean;
  canManageCredential: (user: UserRow) => boolean;
  onEdit: (user: UserRow) => void;
  onLifecycle: (user: UserRow, action: LifecycleAction['action']) => void;
  onCredential: (user: UserRow, mode: CredentialAction['mode']) => void;
};

function UserDesktopRow(props: UserActionsProps) {
  const { user } = props;
  return <tr className="align-top"><td><UserIdentity user={user} /></td><td><AccessState user={user} /></td><td><EmployeeLink user={user} /></td><td><CredentialState user={user} /></td><td><UserActions {...props} /></td></tr>;
}

function UserMobileRecord(props: UserActionsProps) {
  const { user } = props;
  return <MobileRecord><RecordHeader title={user.name} detail={user.email} status={<StatusBadge status={user.isActive ? 'ACTIVE' : 'INACTIVE'} label={user.isActive ? 'Aktif' : 'Nonaktif'} />} /><RecordBody className="space-y-4"><div><p className="dossier-label">Akses</p><Badge className="mt-1 w-fit shrink-0 whitespace-nowrap break-normal [overflow-wrap:normal]">{ROLE_LABELS[user.role] ?? user.role.replaceAll('_', ' ')}</Badge></div><EmployeeLink user={user} /><CredentialState user={user} /></RecordBody>{props.canManageUsers && <RecordActions><UserActions {...props} mobile /></RecordActions>}</MobileRecord>;
}

function UserIdentity({ user }: { user: UserRow }) {
  return <div className="min-w-0"><p className="break-words font-semibold text-brand [overflow-wrap:anywhere]">{user.name}</p><p className="mt-1 break-all text-caption text-muted">{user.email}</p></div>;
}

function AccessState({ user }: { user: UserRow }) {
  return <div className="flex min-w-0 flex-col items-start gap-2"><Badge className="w-fit shrink-0 whitespace-nowrap break-normal [overflow-wrap:normal]">{ROLE_LABELS[user.role] ?? user.role.replaceAll('_', ' ')}</Badge><StatusBadge status={user.isActive ? 'ACTIVE' : 'INACTIVE'} label={user.isActive ? 'Aktif' : 'Nonaktif'} /></div>;
}

function EmployeeLink({ user }: { user: UserRow }) {
  return <div className="min-w-0"><p className="break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">{user.employee?.name ?? 'Tidak terhubung'}</p><p className="mt-1 text-caption text-muted">{user.employee?.employeeNumber ?? 'Tanpa profil karyawan'}</p></div>;
}

function CredentialState({ user }: { user: UserRow }) {
  const credential = user.temporaryCredential;
  if (!credential?.available) return <div><StatusBadge status="INACTIVE" label="Tidak tersedia" /><p className="mt-1 text-caption text-muted">Tidak ada password sementara</p></div>;
  const purpose = credential.purpose === 'PASSWORD_RESET' ? 'Reset password' : 'Pembuatan akun';
  return <div className="min-w-0"><StatusBadge status="PENDING" label="Tersedia" /><p className="mt-1 break-words text-caption text-muted [overflow-wrap:anywhere]">{purpose} · dilihat {credential.revealCount ?? 0}x</p>{credential.createdAt && <p className="mt-0.5 text-caption tabular-nums text-muted">Dibuat {new Date(credential.createdAt).toLocaleDateString('id-ID')}</p>}</div>;
}

function UserActions({ user, canManageUsers, canManageCredential, onEdit, onLifecycle, onCredential, mobile = false }: UserActionsProps & { mobile?: boolean }) {
  if (!canManageUsers) return null;
  const credentialAllowed = canManageCredential(user);
  return <div className={`flex items-center gap-2 ${mobile ? 'w-full' : 'justify-end'}`}><Button size="sm" variant="secondary" className={mobile ? 'flex-1' : undefined} onClick={() => onEdit(user)}>Kelola Akun</Button><DropdownMenu><DropdownMenuTrigger asChild><ActionMenuTrigger label={`Tindakan lain untuk ${user.name}`} /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onLifecycle(user, user.isActive ? 'deactivate' : 'reactivate')}>{user.isActive ? 'Nonaktifkan akun' : 'Aktifkan akun'}</DropdownMenuItem>{credentialAllowed && <DropdownMenuItem onSelect={() => onCredential(user, 'reset')}>Reset password</DropdownMenuItem>}{credentialAllowed && user.temporaryCredential?.available && <DropdownMenuItem onSelect={() => onCredential(user, 'reveal')}>Lihat password sementara</DropdownMenuItem>}<DropdownMenuSeparator className="my-1 h-px bg-border" /><DropdownMenuItem danger onSelect={() => onLifecycle(user, 'delete')}>Hapus aman</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>;
}
