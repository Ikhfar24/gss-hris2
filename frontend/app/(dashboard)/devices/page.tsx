'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';

interface DeviceRow {
  id: string;
  employeeId: string;
  deviceId: string;
  label: string | null;
  boundAt: string;
  lastUsedAt: string;
  employee: { id: string; name: string };
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  async function load() {
    try {
      const data = await apiFetch<DeviceRow[]>('/attendance/devices', { token: getToken() });
      setDevices(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat data perangkat');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function reset(employeeId: string) {
    if (reason.trim().length < 5) {
      setError('Alasan reset wajib diisi (minimal 5 karakter).');
      return;
    }
    setError(null);
    try {
      await apiFetch(`/attendance/devices/${employeeId}`, { method: 'DELETE', token: getToken(), body: { reason } });
      setResettingId(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal reset perangkat');
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Perangkat Terikat (Device Binding)</h1>
      <p className="mb-4 text-sm text-slate-500">
        Setiap karyawan hanya bisa absen dari satu perangkat/browser yang terdaftar. Reset di sini
        kalau karyawan ganti HP.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Karyawan</th>
              <th className="px-4 py-2">Perangkat</th>
              <th className="px-4 py-2">Terikat Sejak</th>
              <th className="px-4 py-2">Terakhir Dipakai</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2">{d.employee.name}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{d.label ?? d.deviceId.slice(0, 12)}</td>
                <td className="px-4 py-2">{new Date(d.boundAt).toLocaleDateString('id-ID')}</td>
                <td className="px-4 py-2">{new Date(d.lastUsedAt).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2 text-right">
                  {resettingId === d.employeeId ? (
                    <div className="flex flex-col items-end gap-2">
                      <input
                        placeholder="Alasan reset"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-48 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => reset(d.employeeId)} className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700">
                          Konfirmasi Reset
                        </button>
                        <button onClick={() => { setResettingId(null); setReason(''); }} className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setResettingId(d.employeeId)} className="text-xs font-medium text-red-600 underline">
                      Reset Perangkat
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {devices.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">Belum ada perangkat terikat.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
