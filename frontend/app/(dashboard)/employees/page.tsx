'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState, FormEvent } from 'react';
import { apiFetch, ApiError, downloadFile } from '@/lib/api';
import { getUser } from '@/lib/auth';

interface LocationOption {
  id: string;
  name: string;
}

interface ContractRow {
  id: string;
  type: string;
  startDate: string;
  endDate: string | null;
  status: string;
  baseSalary: number | null;
}

interface EmployeeRow {
  id: string;
  name: string;
  employmentType: 'TENAGA_BORONGAN' | 'TENAGA_ARSIPARIS';
  status: string;
  joinDate: string;
  dailyRate: number | null;
  employeeNumber?: string | null;
  nik?: string | null;
  phone?: string | null;
  address?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  photoUrl?: string | null;
  jobTitle?: string | null;
  attendanceRequired?: boolean;
  placements: { location: { name: string } }[];
  contracts?: ContractRow[];
}
interface EmployeeResponse { data: EmployeeRow[]; meta: { page: number; pageSize: number; total: number } }
interface ImportResult { dryRun: boolean; valid: boolean; rowCount?: number; created?: number; errors: { row: number; errors: string[] }[] }
interface BulkResult { deactivated: number; failed: number; results: { employeeId: string; success: boolean; error?: string }[] }
interface EmployeeEditForm { name: string; employeeNumber: string; nik: string; email: string; phone: string; address: string; jobTitle: string; reason: string }

const TYPE_LABEL: Record<string, string> = {
  TENAGA_BORONGAN: 'Tenaga Borongan',
  TENAGA_ARSIPARIS: 'Tenaga Arsiparis',
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  TRAINING: 'bg-yellow-100 text-yellow-700',
  ON_LEAVE: 'bg-blue-100 text-blue-700',
  RESIGNED: 'bg-slate-200 text-slate-600',
  TERMINATED: 'bg-red-100 text-red-700',
};

function formatRupiah(n: number | null) {
  if (n === null || n === undefined) return '-';
  return `Rp ${n.toLocaleString('id-ID')}`;
}

export default function EmployeesPage() {
  const [role, setRole] = useState<string | null>(null);
  const canManage = ['ADMIN_HR', 'SYSTEM_ADMIN'].includes(role ?? '');
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState('');
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [editForm, setEditForm] = useState<EmployeeEditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [contracts, setContracts] = useState<Record<string, ContractRow[]>>({});
  const [contractForm, setContractForm] = useState({ type: 'PKWT', startDate: '', endDate: '', baseSalary: '' });
  const [form, setForm] = useState({
    name: '',
    employeeNumber: '',
    phone: '',
    address: '',
    jobTitle: '',
    employmentType: 'TENAGA_BORONGAN',
    joinDate: '',
    initialLocationId: '',
    dailyRate: '',
  });

  async function load(requestedPage = page) {
    try {
      const params = new URLSearchParams({ page: String(requestedPage), pageSize: '25' });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('employmentType', typeFilter);
      const [emps, locs] = await Promise.all([
        apiFetch<EmployeeResponse>(`/employees?${params}`),
        apiFetch<LocationOption[]>('/locations'),
      ]);
      setEmployees(emps.data);
      setTotal(emps.meta.total);
      setPage(emps.meta.page);
      setSelectedIds([]);
      setLocations(locs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat data karyawan');
    }
  }

  useEffect(() => {
    setRole(getUser()?.role ?? null);
    load();
  }, []);

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    load(1);
  }

  function parseImportRows() {
    const value = importText.trim();
    if (!value) throw new Error('Masukkan baris impor terlebih dahulu');
    if (value.startsWith('[')) {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) throw new Error('JSON harus berupa array baris karyawan');
      return parsed;
    }
    const [header, ...lines] = value.split(/\r?\n/).filter(Boolean);
    const keys = header.split(',').map((item) => item.trim());
    if (!keys.includes('name') || !keys.includes('employmentType') || !keys.includes('joinDate')) {
      throw new Error('CSV harus memiliki kolom name, employmentType, dan joinDate');
    }
    return lines.map((line) => Object.fromEntries(keys.map((key, index) => {
      const raw = line.split(',')[index]?.trim() ?? '';
      if (raw === '') return [key, undefined];
      if (raw === 'true' || raw === 'false') return [key, raw === 'true'];
      if (key === 'dailyRate') return [key, Number(raw)];
      return [key, raw];
    })));
  }

  async function submitImport(commit: boolean) {
    setError(null);
    try {
      const rows = parseImportRows();
      const result = await apiFetch<ImportResult>('/employees/import', { method: 'POST', body: { rows, dryRun: !commit, commit } });
      setImportResult(result);
      if (commit && result.valid) await load(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Gagal memproses impor');
    }
  }

  async function deactivateSelected() {
    if (!bulkReason.trim() || selectedIds.length === 0) return;
    setError(null);
    try {
      const result = await apiFetch<BulkResult>('/employees/bulk-deactivate', { method: 'PATCH', body: { employeeIds: selectedIds, reason: bulkReason.trim() } });
      setBulkResult(result);
      setBulkReason('');
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Gagal menonaktifkan karyawan terpilih'); }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/employees', {
        method: 'POST',
        body: {
          ...form,
          employeeNumber: form.employeeNumber || undefined,
          phone: form.phone || undefined,
          address: form.address || undefined,
          jobTitle: form.jobTitle || undefined,
          initialLocationId: form.initialLocationId || undefined,
          dailyRate: form.dailyRate ? Number(form.dailyRate) : undefined,
        },
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuat data karyawan');
    } finally {
      setSubmitting(false);
    }
  }

  function editEmployee(employee: EmployeeRow) {
    setEditing(employee);
    setEditForm({
      name: employee.name,
      employeeNumber: employee.employeeNumber ?? '',
      nik: employee.nik ?? '',
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      address: employee.address ?? '',
      jobTitle: employee.jobTitle ?? '',
      reason: '',
    });
    setError(null);
    setSuccess(null);
  }

  async function saveEmployeeEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing || !editForm || !editForm.name.trim() || !editForm.reason.trim()) {
      setError('Nama dan alasan perubahan wajib diisi');
      return;
    }
    setSavingEdit(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/employees/${editing.id}`, { method: 'PATCH', body: {
        name: editForm.name.trim(),
        employeeNumber: editForm.employeeNumber.trim() || undefined,
        nik: editForm.nik.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        address: editForm.address.trim() || undefined,
        email: editForm.email.trim() || undefined,
        jobTitle: editForm.jobTitle.trim() || undefined,
        reason: editForm.reason.trim(),
      } });
      await load();
      setEditing(null);
      setEditForm(null);
      setSuccess('Data master karyawan berhasil diperbarui.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memperbarui karyawan');
    } finally {
      setSavingEdit(false);
    }
  }

  async function lifecycle(employee: EmployeeRow, action: 'deactivate' | 'reactivate' | 'delete') {
    const reason = window.prompt('Alasan wajib:');
    if (!reason || (action === 'delete' && !window.confirm('Hapus hanya jika tanpa riwayat. Lanjutkan?'))) return;
    try {
      await apiFetch(`/employees/${employee.id}${action === 'delete' ? '' : `/${action}`}`, { method: action === 'delete' ? 'DELETE' : 'PATCH', body: { reason } });
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Aksi lifecycle gagal'); }
  }

  async function toggleContracts(employeeId: string) {
    if (expandedId === employeeId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(employeeId);
    if (!contracts[employeeId]) {
      try {
        const data = await apiFetch<ContractRow[]>(`/contracts/employee/${employeeId}`);
        setContracts((c) => ({ ...c, [employeeId]: data }));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Gagal memuat kontrak');
      }
    }
  }

  async function onAddContract(employeeId: string, e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/contracts', {
        method: 'POST',
        body: {
          employeeId,
          type: contractForm.type,
          startDate: contractForm.startDate,
          endDate: contractForm.endDate || undefined,
          baseSalary: contractForm.baseSalary ? Number(contractForm.baseSalary) : undefined,
        },
      });
      setContractForm({ type: 'PKWT', startDate: '', endDate: '', baseSalary: '' });
      const data = await apiFetch<ContractRow[]>(`/contracts/employee/${employeeId}`);
      setContracts((c) => ({ ...c, [employeeId]: data }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menambah kontrak');
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Data Karyawan</h1>
        <div className="flex flex-wrap gap-2">
          {canManage && <><button onClick={() => downloadFile('/employees/export?format=xlsx', null, 'daftar-karyawan.xlsx').catch((err) => setError(err instanceof ApiError ? err.message : 'Gagal mengekspor data'))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Ekspor Excel</button><button onClick={() => downloadFile('/employees/export?format=pdf', null, 'daftar-karyawan.pdf').catch((err) => setError(err instanceof ApiError ? err.message : 'Gagal mengekspor data'))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Ekspor PDF</button></>}
          {canManage && <button onClick={() => setShowForm((s) => !s)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">{showForm ? 'Batal' : '+ Tambah Karyawan'}</button>}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mb-4 text-sm text-green-700">{success}</p>}

      {editing && editForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        <form onSubmit={saveEmployeeEdit} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Edit Data Karyawan</h2><button type="button" onClick={() => { setEditing(null); setEditForm(null); setError(null); }} className="text-sm text-slate-500 underline">Batal</button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <EditField label="Nama" required value={editForm.name} onChange={(value) => setEditForm({ ...editForm, name: value })} />
            <EditField label="NIP" value={editForm.employeeNumber} onChange={(value) => setEditForm({ ...editForm, employeeNumber: value })} />
            <EditField label="NIK" value={editForm.nik} onChange={(value) => setEditForm({ ...editForm, nik: value })} />
            <EditField label="Email" type="email" value={editForm.email} onChange={(value) => setEditForm({ ...editForm, email: value })} />
            <EditField label="Telepon" value={editForm.phone} onChange={(value) => setEditForm({ ...editForm, phone: value })} />
            <EditField label="Jabatan" value={editForm.jobTitle} onChange={(value) => setEditForm({ ...editForm, jobTitle: value })} />
            <label className="text-sm sm:col-span-2">Alamat<textarea rows={3} value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            <label className="text-sm sm:col-span-2">Alasan perubahan<input required value={editForm.reason} onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          </div>
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => { setEditing(null); setEditForm(null); setError(null); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Batal</button><button disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60">{savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}</button></div>
        </form>
      </div>}

      {showForm && (
        <form onSubmit={onCreate} className="mb-6 grid max-w-xl gap-3 rounded-xl border border-slate-200 bg-white p-4">
           <input required placeholder="Nama lengkap" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
           <input placeholder="NIP" value={form.employeeNumber} onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
           <input placeholder="Nomor telepon/WhatsApp" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
           <input placeholder="Alamat" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
           <input placeholder="Jabatan" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="TENAGA_BORONGAN">Tenaga Borongan</option>
            <option value="TENAGA_ARSIPARIS">Tenaga Arsiparis</option>
          </select>
          <label className="text-sm">
            Tanggal bergabung
            <input required type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <select value={form.initialLocationId} onChange={(e) => setForm({ ...form, initialLocationId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">-- Penempatan awal (opsional) --</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <label className="text-sm">
            Tarif Harian Lepas (opsional — isi kalau belum ada kontrak/masih training)
            <input type="number" min={0} placeholder="cth. 95000" value={form.dailyRate} onChange={(e) => setForm({ ...form, dailyRate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
            {submitting ? 'Menyimpan...' : 'Simpan Karyawan'}
          </button>
        </form>
      )}

      <form onSubmit={applyFilters} className="mb-4 flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, NIP, atau jabatan" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">Semua status</option>{Object.keys(STATUS_STYLE).concat('INACTIVE').map((status) => <option key={status} value={status}>{status}</option>)}</select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">Semua jenis</option><option value="TENAGA_BORONGAN">Tenaga Borongan</option><option value="TENAGA_ARSIPARIS">Tenaga Arsiparis</option></select>
        <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Terapkan</button>
      </form>

      {canManage && <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Impor Karyawan</h2>
        <p className="mt-1 text-xs text-slate-500">Tempel array JSON atau CSV sederhana dengan header. Gunakan pratinjau sebelum komit.</p>
        <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'[{"name":"Nama", "employmentType":"TENAGA_BORONGAN", "joinDate":"2026-01-01"}]'} className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs" />
        <div className="mt-2 flex gap-2"><button type="button" onClick={() => submitImport(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Pratinjau</button><button type="button" onClick={() => submitImport(true)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">Komit Impor</button></div>
        {importResult && <div className="mt-3 text-sm"><p>{importResult.dryRun ? 'Pratinjau' : 'Impor'}: {importResult.valid ? 'valid' : 'memiliki kesalahan'}{importResult.rowCount !== undefined ? `, ${importResult.rowCount} baris` : ''}{importResult.created !== undefined ? `, ${importResult.created} dibuat` : ''}.</p>{importResult.errors.map((item) => <p key={item.row} className="text-red-600">Baris {item.row}: {item.errors.join(', ')}</p>)}</div>}
      </div>}

      {canManage && selectedIds.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><span>{selectedIds.length} karyawan dipilih</span><input value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} placeholder="Alasan nonaktifkan (min. 3 karakter)" className="rounded-lg border border-slate-300 px-3 py-2" /><button onClick={deactivateSelected} disabled={bulkReason.trim().length < 3} className="rounded-lg bg-red-700 px-3 py-2 text-white disabled:opacity-50">Nonaktifkan Terpilih</button></div>}
      {bulkResult && <p className="mb-4 text-sm">Nonaktif massal: {bulkResult.deactivated} berhasil, {bulkResult.failed} gagal.{bulkResult.results.filter((item) => !item.success).map((item) => ` ${item.error}`).join('')}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              {canManage && <th className="px-4 py-2"><input type="checkbox" aria-label="Pilih semua" checked={employees.length > 0 && selectedIds.length === employees.length} onChange={(e) => setSelectedIds(e.target.checked ? employees.map((emp) => emp.id) : [])} /></th>}
              <th className="px-4 py-2">Nama</th>
              <th className="px-4 py-2">Jenis</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Penempatan Aktif</th>
              <th className="px-4 py-2">Tarif Harian</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <Fragment key={emp.id}>
                <tr className="border-t border-slate-100">
                   {canManage && <td className="px-4 py-2"><input type="checkbox" aria-label={`Pilih ${emp.name}`} checked={selectedIds.includes(emp.id)} onChange={(e) => setSelectedIds((ids) => e.target.checked ? [...ids, emp.id] : ids.filter((id) => id !== emp.id))} /></td>}
                   <td className="px-4 py-2">{emp.name}</td>
                  <td className="px-4 py-2">{TYPE_LABEL[emp.employmentType]}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[emp.status] ?? 'bg-slate-100'}`}>
                      {emp.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">{emp.placements[0]?.location?.name ?? '-'}</td>
                  <td className="px-4 py-2">{formatRupiah(emp.dailyRate)}</td>
                   <td className="px-4 py-2 text-right">
                     <Link href={`/employees/${emp.id}/360`} className="text-xs underline">Profil Lengkap</Link>
                    {canManage && <button onClick={() => toggleContracts(emp.id)} className="text-xs text-slate-500 underline hover:text-slate-900">
                      {expandedId === emp.id ? 'Tutup' : 'Kelola Kontrak'}
                    </button>}
                    {canManage && <><button onClick={() => editEmployee(emp)} className="ml-2 text-xs underline">Edit</button><button onClick={() => lifecycle(emp, emp.status === 'INACTIVE' ? 'reactivate' : 'deactivate')} className="ml-2 text-xs underline">{emp.status === 'INACTIVE' ? 'Aktifkan' : 'Nonaktifkan'}</button><button onClick={() => lifecycle(emp, 'delete')} className="ml-2 text-xs text-red-700 underline">Hapus</button></>}
                  </td>
                </tr>
                {expandedId === emp.id && (
                  <tr className="border-t border-slate-100 bg-slate-50">
                    <td colSpan={canManage ? 7 : 6} className="px-4 py-4">
                      <div className="mb-3">
                        <h4 className="mb-2 text-xs font-semibold text-slate-500">RIWAYAT KONTRAK</h4>
                        {(contracts[emp.id] ?? []).length === 0 && <p className="text-xs text-slate-400">Belum ada kontrak.</p>}
                        <ul className="space-y-1">
                          {(contracts[emp.id] ?? []).map((c) => (
                            <li key={c.id} className="text-xs text-slate-700">
                              {c.type} · {new Date(c.startDate).toLocaleDateString('id-ID')}
                              {c.endDate ? ` – ${new Date(c.endDate).toLocaleDateString('id-ID')}` : ' (tanpa batas)'} ·{' '}
                              <span className={c.status === 'ACTIVE' ? 'text-green-600' : 'text-slate-400'}>{c.status}</span> ·{' '}
                              {formatRupiah(c.baseSalary)}/bulan
                            </li>
                          ))}
                        </ul>
                      </div>
                      <form onSubmit={(e) => onAddContract(emp.id, e)} className="grid max-w-md gap-2 sm:grid-cols-2">
                        <select value={contractForm.type} onChange={(e) => setContractForm({ ...contractForm, type: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                          <option value="PKWT">PKWT</option>
                          <option value="PKWTT">PKWTT</option>
                          <option value="OTHER">Lainnya</option>
                        </select>
                        <input type="number" min={0} required placeholder="Gaji pokok/bulan" value={contractForm.baseSalary} onChange={(e) => setContractForm({ ...contractForm, baseSalary: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                        <input type="date" required value={contractForm.startDate} onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                        <input type="date" placeholder="Selesai (opsional)" value={contractForm.endDate} onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                        <button type="submit" className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-800 sm:col-span-2">
                          + Tambah Kontrak
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm"><span>Total {total} karyawan</span><div className="flex items-center gap-2"><button onClick={() => load(page - 1)} disabled={page <= 1} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50">Sebelumnya</button><span>Halaman {page} / {Math.max(1, Math.ceil(total / 25))}</span><button onClick={() => load(page + 1)} disabled={page >= Math.ceil(total / 25)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50">Berikutnya</button></div></div>
    </div>
  );
}

function EditField({ label, value, onChange, required = false, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <label className="text-sm">{label}<input required={required} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>;
}
