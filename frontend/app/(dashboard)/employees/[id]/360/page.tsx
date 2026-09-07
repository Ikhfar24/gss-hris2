'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError, protectedMediaUrl, uploadFile } from '@/lib/api';
import { getUser } from '@/lib/auth';

interface Employee360 {
  profile: Record<string, any>;
  recentAttendance?: Record<string, any>[];
  leaveRequests?: Record<string, any>[];
  temporaryAssignments?: Record<string, any>[];
  absenceCases?: Record<string, any>[];
  overtimeRequests?: Record<string, any>[];
  profileChangeHistory?: Record<string, any>[];
}

function date(value: unknown) {
  if (!value) return '-';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString('id-ID');
}

function value(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return '-';
  return String(value);
}

function Section({ title, rows, columns }: { title: string; rows?: Record<string, any>[]; columns: { key: string; label: string; format?: 'date' }[] }) {
  if (!rows) return <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm text-slate-500">Bagian ini tidak tersedia untuk akses Anda.</p></section>;
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><h2 className="border-b border-slate-200 px-4 py-3 font-semibold">{title}</h2>{rows.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">Belum ada data.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr>{columns.map((column) => <th key={column.key} className="px-4 py-2">{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index} className="border-t border-slate-100">{columns.map((column) => <td key={column.key} className="px-4 py-2">{column.format === 'date' ? date(row[column.key]) : value(row[column.key])}</td>)}</tr>)}</tbody></table></div>}</section>;
}

export default function Employee360Page() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Employee360 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  async function load() {
    try {
      setData(await apiFetch<Employee360>(`/employees/${params.id}/360`));
      setPhotoFailed(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat Profil Lengkap');
    }
  }

  useEffect(() => {
    setRole(getUser()?.role ?? null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function updatePhoto() {
    if (!photo) {
      setError('Pilih file foto terlebih dahulu');
      return;
    }
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      await uploadFile(`/employees/${params.id}/profile-photo`, photo);
      setPhoto(null);
      setSuccess('Foto profil berhasil diperbarui.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengunggah foto profil');
    } finally {
      setUploading(false);
    }
  }

  if (error) return <div><Link href="/employees" className="text-sm underline">Kembali ke Data Karyawan</Link><p className="mt-4 text-sm text-red-600">{error}</p></div>;
  if (!data) return <p className="text-sm text-slate-500">Memuat Profil Lengkap...</p>;

  const profile = data.profile;
  const initials = String(profile.name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
  return <div>
    <Link href="/employees" className="text-sm underline">Kembali ke Data Karyawan</Link>
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-4">
        {profile.photoUrl && !photoFailed ? <img src={protectedMediaUrl(String(profile.photoUrl))} alt={`Foto profil ${profile.name}`} onError={() => setPhotoFailed(true)} className="h-20 w-20 rounded-full object-cover" /> : <div aria-label="Foto profil belum tersedia" className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-200 text-xl font-semibold text-slate-600">{initials}</div>}
        <div><h1 className="text-2xl font-semibold">Profil Lengkap</h1><p className="mt-1 text-slate-600">{profile.name} {profile.employeeNumber ? `(${profile.employeeNumber})` : ''}</p></div>
      </div>
      {role === 'ADMIN_HR' && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="text-sm" /><button type="button" disabled={!photo || uploading} onClick={updatePhoto} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">{uploading ? 'Mengunggah...' : profile.photoUrl ? 'Ganti Foto' : 'Unggah Foto'}</button><span className="text-xs text-slate-500">JPEG, PNG, atau WebP; maksimal 5 MB.</span></div>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}{success && <p className="mt-3 text-sm text-green-700">{success}</p>}
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><p><span className="text-slate-500">Status:</span> {value(profile.status)}</p><p><span className="text-slate-500">Jabatan:</span> {value(profile.jobTitle)}</p><p><span className="text-slate-500">Jenis:</span> {value(profile.employmentType)}</p><p><span className="text-slate-500">Bergabung:</span> {date(profile.joinDate)}</p></div>
    </div>
     <div className="mt-4 grid gap-4">
       <Section title="Riwayat Penempatan" rows={profile.placements} columns={[{ key: 'startDate', label: 'Mulai', format: 'date' }, { key: 'endDate', label: 'Selesai', format: 'date' }, { key: 'status', label: 'Status' }]} />
       <Section title="Riwayat Kontrak" rows={profile.contracts} columns={[{ key: 'type', label: 'Jenis' }, { key: 'startDate', label: 'Mulai', format: 'date' }, { key: 'endDate', label: 'Selesai', format: 'date' }, { key: 'status', label: 'Status' }]} />
       <Section title="Absensi Terbaru" rows={data.recentAttendance} columns={[{ key: 'date', label: 'Tanggal', format: 'date' }, { key: 'checkInAt', label: 'Masuk' }, { key: 'checkOutAt', label: 'Pulang' }, { key: 'latenessStatus', label: 'Keterlambatan' }, { key: 'validationStatus', label: 'Validasi' }]} />
      <Section title="Cuti, Izin, dan Resign" rows={data.leaveRequests} columns={[{ key: 'type', label: 'Jenis' }, { key: 'startDate', label: 'Mulai', format: 'date' }, { key: 'endDate', label: 'Selesai', format: 'date' }, { key: 'status', label: 'Status' }]} />
      <Section title="Penugasan Sementara" rows={data.temporaryAssignments} columns={[{ key: 'startDate', label: 'Mulai', format: 'date' }, { key: 'endDate', label: 'Selesai', format: 'date' }, { key: 'status', label: 'Status' }, { key: 'reason', label: 'Alasan' }]} />
      <Section title="Kasus Ketidakhadiran" rows={data.absenceCases} columns={[{ key: 'date', label: 'Tanggal', format: 'date' }, { key: 'status', label: 'Status' }, { key: 'note', label: 'Catatan' }]} />
      <Section title="Lembur" rows={data.overtimeRequests} columns={[{ key: 'date', label: 'Tanggal', format: 'date' }, { key: 'startTime', label: 'Mulai' }, { key: 'endTime', label: 'Selesai' }, { key: 'status', label: 'Status' }, { key: 'reason', label: 'Alasan' }]} />
      <Section title="Riwayat Perubahan Profil" rows={data.profileChangeHistory} columns={[{ key: 'requestedAt', label: 'Diajukan', format: 'date' }, { key: 'reviewedAt', label: 'Ditinjau', format: 'date' }, { key: 'status', label: 'Status' }, { key: 'reviewNote', label: 'Catatan' }]} />
    </div>
  </div>;
}
