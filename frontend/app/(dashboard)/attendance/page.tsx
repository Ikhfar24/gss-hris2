'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { getDeviceId } from '@/lib/device';

interface AttendanceRecord {
  id: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInGpsStatus: string | null;
  checkInDistanceMeters: number | null;
  latenessStatus: string;
  validationStatus: string;
  forgottenCheckout?: boolean;
  location: { name: string; radiusMeters: number };
}

const VALIDATION_LABEL: Record<string, { label: string; style: string }> = {
  VALID: { label: 'Valid', style: 'bg-slate-100 text-slate-600' },
  NEEDS_REVIEW: { label: 'Perlu ditinjau', style: 'bg-yellow-100 text-yellow-700' },
  APPROVED_AFTER_REVIEW: { label: 'Disetujui setelah tinjauan', style: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Ditolak', style: 'bg-red-100 text-red-700' },
};

interface TodayResponse {
  attendance: AttendanceRecord | null;
  expectedLocation: { id: string; name: string; radiusMeters: number };
}

export default function AttendancePage() {
  const role = getUser()?.role;
  const [employee, setEmployee] = useState<{ attendanceRequired: boolean; status: string; placements?: { status: string }[] } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const canMonitor = ['ADMIN_HR', 'SYSTEM_ADMIN', 'KOORDINATOR', 'DIREKTUR'].includes(role ?? '');
  const canSelfCheckIn = !!employee && employee.attendanceRequired && employee.status === 'ACTIVE' && employee.placements?.some((placement) => placement.status === 'ACTIVE');

  useEffect(() => {
    apiFetch<{ attendanceRequired: boolean; status: string; placements?: { status: string }[] }>('/employees/me', { token: getToken() })
      .then(setEmployee)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setEmployee(null);
        else {
          setEmployee(null);
          setError(err instanceof ApiError ? err.message : 'Gagal memeriksa profil karyawan');
        }
      });
  }, []);

  if (employee === undefined) return <p className="text-sm text-slate-500">Memuat...</p>;
  if (!canSelfCheckIn && !canMonitor) {
    return <p className="text-sm text-slate-500">Akun ini belum memiliki profil karyawan aktif yang wajib absensi.</p>;
  }
  return <div className="space-y-8">{error && <p className="text-sm text-red-600">{error}</p>}{canSelfCheckIn && <SelfCheckIn />}{canMonitor && <MonitoringDashboard />}</div>;
}

// ---------------------------------------------------------------------
// Offline queue (§11.5 "absensi offline") — stored in the browser only,
// flushed when connectivity returns or the user asks to sync manually.
// ---------------------------------------------------------------------
const QUEUE_KEY = 'papaiz_attendance_queue';

interface QueuedItem {
  id: string;
  path: string;
  method: 'POST' | 'PATCH';
  body: Record<string, unknown>;
  queuedAt: string;
}

function readQueue(): QueuedItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

function isLikelyNetworkError(err: unknown): boolean {
  // apiFetch throws ApiError for real server rejections (e.g. "sudah
  // check-in", "di luar radius") — those must NOT be queued, they're
  // genuine outcomes. Anything else (fetch() itself failing) is treated
  // as connectivity trouble and gets queued instead.
  return !(err instanceof ApiError);
}

// ---------------------------------------------------------------------
// Self-service check-in/out (Karyawan) — §11.1
// ---------------------------------------------------------------------
function SelfCheckIn() {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [mode, setMode] = useState<'check-in' | 'check-out' | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [gpsFailed, setGpsFailed] = useState(false);
  const [failureNote, setFailureNote] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function load() {
    try {
      const data = await apiFetch<TodayResponse>('/attendance/me/today', { token: getToken() });
      setToday(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat status absensi');
    }
    setQueueCount(readQueue().length);
  }

  useEffect(() => {
    load();
    window.addEventListener('online', flushQueue);
    return () => {
      stopCamera();
      window.removeEventListener('online', flushQueue);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cameraOn && !cameraFailed && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOn, cameraFailed]);

  async function flushQueue() {
    const queue = readQueue();
    if (queue.length === 0) return;
    setInfo('Menyinkronkan data absensi offline...');
    const remaining: QueuedItem[] = [];
    for (const item of queue) {
      try {
        await apiFetch(item.path, { method: item.method, token: getToken(), body: item.body });
      } catch (err) {
        if (isLikelyNetworkError(err)) {
          remaining.push(item); // still offline, try again later
        }
        // else: server rejected it for real (e.g. already checked in from
        // another session) — drop it, nothing more we can do with it.
      }
    }
    writeQueue(remaining);
    setQueueCount(remaining.length);
    setInfo(remaining.length === 0 ? 'Semua data absensi offline berhasil disinkronkan.' : null);
    await load();
  }

  async function startCamera(nextMode: 'check-in' | 'check-out') {
    setError(null);
    setInfo(null);
    setCameraFailed(false);
    setGpsFailed(false);
    setFailureNote('');
    setMode(nextMode);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      // §11.5 "kamera gagal" — don't dead-end the employee, let them
      // continue without a photo as long as they explain why (reviewed by HR).
      setCameraFailed(true);
      setCameraOn(true); // show the evidence panel even without a live feed
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  function capturePhoto(): string | null {
    if (cameraFailed) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  function getPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Browser tidak mendukung GPS'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
    });
  }

  async function submit() {
    if (!mode) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const selfieBase64 = capturePhoto() ?? undefined;

      let latitude: number | undefined;
      let longitude: number | undefined;
      let accuracyMeters: number | undefined;
      let gpsFailedNow = gpsFailed;
      try {
        const pos = await getPosition();
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        accuracyMeters = pos.coords.accuracy;
      } catch {
        gpsFailedNow = true;
        setGpsFailed(true);
      }

      const needsFailureNote = cameraFailed || gpsFailedNow;
      if (needsFailureNote && failureNote.trim().length < 3) {
        setError('GPS atau kamera gagal. Tuliskan alasan singkat agar tetap bisa absen (akan ditinjau HR).');
        setBusy(false);
        return;
      }

      const body: Record<string, unknown> = {
        latitude,
        longitude,
        accuracyMeters,
        selfieBase64,
        deviceInfo: navigator.userAgent,
        deviceId: getDeviceId(),
      };
      if (needsFailureNote) {
        body.failureReason = cameraFailed && gpsFailedNow ? 'OTHER' : cameraFailed ? 'CAMERA_FAILED' : 'GPS_FAILED';
        body.failureNote = failureNote.trim();
      }

      const path = mode === 'check-in' ? '/attendance/check-in' : '/attendance/check-out';
      const method = mode === 'check-in' ? 'POST' : 'PATCH';

      if (!navigator.onLine) {
        throw new Error('OFFLINE');
      }

      try {
        await apiFetch(path, { method, token: getToken(), body });
      } catch (err) {
        if (isLikelyNetworkError(err)) throw new Error('OFFLINE');
        throw err;
      }

      stopCamera();
      setMode(null);
      await load();
    } catch (err) {
      if (err instanceof Error && err.message === 'OFFLINE') {
        // §11.5 "absensi offline" — queue it locally; clientRecordedAt marks
        // this as the real moment the employee attempted to record it.
        const queue = readQueue();
        const queuedAt = new Date().toISOString();
        const selfieBase64 = capturePhoto() ?? undefined;
        queue.push({
          id: crypto.randomUUID(),
          path: mode === 'check-in' ? '/attendance/check-in' : '/attendance/check-out',
          method: mode === 'check-in' ? 'POST' : 'PATCH',
          body: {
            deviceInfo: navigator.userAgent,
            deviceId: getDeviceId(),
            selfieBase64,
            failureReason: cameraFailed || gpsFailed ? (cameraFailed ? 'CAMERA_FAILED' : 'GPS_FAILED') : undefined,
            failureNote: failureNote.trim() || undefined,
            clientRecordedAt: queuedAt,
          },
          queuedAt,
        });
        writeQueue(queue);
        setQueueCount(queue.length);
        setInfo('Tidak ada koneksi internet. Absensi disimpan di HP Anda dan akan otomatis dikirim saat online kembali.');
        stopCamera();
        setMode(null);
      } else {
        setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Gagal absen');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!today) {
    if (error) {
      return (
        <div className="max-w-md rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      );
    }
    return <p className="text-sm text-slate-500">Memuat...</p>;
  }

  const att = today.attendance;

  return (
    <div className="max-w-md">
      <h1 className="mb-1 text-2xl font-semibold">Absensi Hari Ini</h1>
      <p className="mb-4 text-sm text-slate-500">Lokasi penempatan: {today.expectedLocation.name}</p>

      {queueCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          <span>{queueCount} absensi belum tersinkron.</span>
          <button onClick={flushQueue} className="font-medium underline">Sinkronkan sekarang</button>
        </div>
      )}
      {info && <p className="mb-4 text-sm text-blue-600">{info}</p>}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <div className="flex justify-between py-1">
          <span className="text-slate-500">Masuk</span>
          <span>{att?.checkInAt ? new Date(att.checkInAt).toLocaleTimeString('id-ID') : '-'}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-slate-500">Pulang</span>
          <span className={att?.checkInAt && !att?.checkOutAt ? 'font-medium text-red-600' : ''}>{att?.checkOutAt ? new Date(att.checkOutAt).toLocaleTimeString('id-ID') : att?.checkInAt ? 'Belum check-out' : '-'}</span>
        </div>
        {att?.checkInAt && !att?.checkOutAt && (
          <p className="mt-2 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">Anda belum check-out. Lakukan check-out sebelum meninggalkan lokasi kerja.</p>
        )}
        {att?.latenessStatus && att.latenessStatus !== 'NOT_APPLICABLE' && (
          <div className="flex justify-between py-1">
            <span className="text-slate-500">Status</span>
            <span className={att.latenessStatus === 'LATE' ? 'text-red-600' : 'text-green-600'}>
              {att.latenessStatus === 'LATE' ? 'Terlambat' : 'Tepat waktu'}
            </span>
          </div>
        )}
      </div>

      {!cameraOn && !att?.checkInAt && (
        <button onClick={() => startCamera('check-in')} className="w-full rounded-lg bg-slate-900 py-2 text-sm text-white hover:bg-slate-800">
          Check-in
        </button>
      )}
      {!cameraOn && att?.checkInAt && !att?.checkOutAt && (
        <button onClick={() => startCamera('check-out')} className="w-full rounded-lg bg-slate-900 py-2 text-sm text-white hover:bg-slate-800">
          Check-out
        </button>
      )}
      {!cameraOn && att?.checkInAt && att?.checkOutAt && (
        <p className="text-center text-sm text-green-600">Absensi hari ini sudah lengkap. Terima kasih!</p>
      )}

      {cameraOn && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {!cameraFailed && (
            <video ref={videoRef} autoPlay playsInline muted className="mb-3 w-full rounded-lg bg-black" />
          )}
          <canvas ref={canvasRef} className="hidden" />

          {cameraFailed && (
            <p className="mb-3 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              Kamera tidak bisa diakses. Anda tetap bisa absen tanpa foto, tapi wajib isi alasan di bawah — data ini akan ditinjau HR.
            </p>
          )}

          {(cameraFailed || gpsFailed) && (
            <textarea
              placeholder="Alasan GPS/kamera gagal (wajib diisi)"
              value={failureNote}
              onChange={(e) => setFailureNote(e.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={2}
            />
          )}

          {!cameraFailed && (
            <p className="mb-3 text-xs text-slate-500">
              Pastikan wajah terlihat jelas dan Anda mengizinkan akses lokasi saat diminta.
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={busy}
              className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busy ? 'Memproses...' : `${cameraFailed ? 'Kirim' : 'Ambil Foto &'} ${mode === 'check-in' ? 'Check-in' : 'Check-out'}`}
            </button>
            <button
              onClick={() => {
                stopCamera();
                setMode(null);
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Monitoring dashboard (HR/Koordinator/Direktur/System Admin) — §14
// ---------------------------------------------------------------------
function MonitoringDashboard() {
  const [summary, setSummary] = useState<{ hadir: number; terlambat: number; tidakHadir: number; perluDitinjau: number } | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [openRows, setOpenRows] = useState<any[]>([]);
  const [attentionRows, setAttentionRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showOpen, setShowOpen] = useState(false);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctionForm, setCorrectionForm] = useState({ checkInAt: '', checkOutAt: '', reason: '' });
  const role = getUser()?.role;
  const canCorrect = role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const canReview = role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN' || role === 'KOORDINATOR';

  async function load() {
    try {
      const token = getToken();
      const [s, r, o, a] = await Promise.all([
        apiFetch<any>('/attendance/summary', { token }),
        apiFetch<any[]>('/attendance', { token }),
        canCorrect ? apiFetch<any[]>('/attendance/open', { token }) : Promise.resolve([]),
        canReview ? apiFetch<any[]>('/attendance/attention', { token }) : Promise.resolve([]),
      ]);
      setSummary(s);
      setRows(r);
      setOpenRows(o);
      setAttentionRows(a);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat data absensi');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toLocalInput(iso: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openCorrection(row: any) {
    setCorrectingId(row.id);
    setCorrectionForm({
      checkInAt: toLocalInput(row.checkInAt),
      checkOutAt: toLocalInput(row.checkOutAt),
      reason: '',
    });
  }

  async function submitCorrection() {
    if (!correctingId) return;
    if (correctionForm.reason.trim().length < 5) {
      setError('Alasan koreksi wajib diisi (minimal 5 karakter).');
      return;
    }
    try {
      await apiFetch(`/attendance/${correctingId}/correct`, {
        method: 'PATCH',
        token: getToken(),
        body: {
          checkInAt: correctionForm.checkInAt ? new Date(correctionForm.checkInAt).toISOString() : undefined,
          checkOutAt: correctionForm.checkOutAt ? new Date(correctionForm.checkOutAt).toISOString() : undefined,
          reason: correctionForm.reason,
        },
      });
      setCorrectingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan koreksi');
    }
  }

  async function review(id: string, decision: 'APPROVED' | 'REJECTED') {
    const note = window.prompt(decision === 'APPROVED' ? 'Catatan persetujuan (minimal 5 karakter):' : 'Alasan penolakan (minimal 5 karakter):');
    if (!note || note.trim().length < 5) return;
    try {
      await apiFetch(`/attendance/${id}/review`, { method: 'POST', token: getToken(), body: { decision, note: note.trim() } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal meninjau absensi');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Monitoring Absensi</h1>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Hadir" value={summary.hadir} style="text-green-600" />
          <StatCard label="Terlambat" value={summary.terlambat} style="text-yellow-600" />
          <StatCard label="Tidak Hadir" value={summary.tidakHadir} style="text-red-600" />
          <StatCard label="Perlu Ditinjau" value={summary.perluDitinjau} style="text-blue-600" />
        </div>
      )}

      {canReview && attentionRows.length > 0 && (
        <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-yellow-900">Perlu Perhatian</h2>
          <div className="space-y-2 text-sm">
            {attentionRows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 border-t border-yellow-200 pt-2 first:border-t-0 first:pt-0">
                <span className="font-medium">{r.employee.name}</span>
                <span>{new Date(r.date).toLocaleDateString('id-ID')}</span>
                {r.forgottenCheckout && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800">Lupa check-out</span>}
                {r.checkInAt && !r.checkOutAt && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Belum check-out</span>}
                {r.validationStatus === 'NEEDS_REVIEW' && <>
                  <button onClick={() => review(r.id, 'APPROVED')} className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700">Setujui</button>
                  <button onClick={() => review(r.id, 'REJECTED')} className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700">Tolak</button>
                </>}
              </div>
            ))}
          </div>
        </div>
      )}

      {canCorrect && openRows.length > 0 && (
        <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-yellow-800">
              {openRows.length} karyawan lupa check-out (30 hari terakhir)
            </h2>
            <button onClick={() => setShowOpen((s) => !s)} className="text-xs font-medium text-yellow-800 underline">
              {showOpen ? 'Sembunyikan' : 'Lihat'}
            </button>
          </div>
          {showOpen && (
            <table className="w-full text-sm">
              <tbody>
                {openRows.map((r) => (
                  <tr key={r.id} className="border-t border-yellow-200">
                    <td className="py-1.5">{r.employee.name}</td>
                    <td className="py-1.5">{new Date(r.date).toLocaleDateString('id-ID')}</td>
                    <td className="py-1.5">{r.location.name}</td>
                    <td className="py-1.5">Check-in: {new Date(r.checkInAt).toLocaleTimeString('id-ID')}</td>
                    <td className="py-1.5 text-right">
                      <button onClick={() => openCorrection(r)} className="text-xs font-medium text-slate-700 underline">
                        Koreksi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {correctingId && (
        <div className="mb-6 rounded-xl border border-slate-300 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Koreksi Absensi</h2>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="text-xs">
              Check-in
              <input type="datetime-local" value={correctionForm.checkInAt} onChange={(e) => setCorrectionForm({ ...correctionForm, checkInAt: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs">
              Check-out
              <input type="datetime-local" value={correctionForm.checkOutAt} onChange={(e) => setCorrectionForm({ ...correctionForm, checkOutAt: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
          </div>
          <textarea
            placeholder="Alasan koreksi (wajib)"
            value={correctionForm.reason}
            onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            rows={2}
          />
          <div className="flex gap-2">
            <button onClick={submitCorrection} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
              Simpan Koreksi
            </button>
            <button onClick={() => setCorrectingId(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              Batal
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Karyawan</th>
              <th className="px-4 py-2">Lokasi</th>
              <th className="px-4 py-2">Masuk</th>
              <th className="px-4 py-2">Pulang</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Validasi</th>
              {canCorrect && <th className="px-4 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{r.employee.name}</td>
                <td className="px-4 py-2">{r.location.name}</td>
                <td className="px-4 py-2">{r.checkInAt ? new Date(r.checkInAt).toLocaleTimeString('id-ID') : '-'}</td>
                <td className="px-4 py-2">{r.checkOutAt ? new Date(r.checkOutAt).toLocaleTimeString('id-ID') : <span className="font-medium text-red-600">Belum check-out</span>}</td>
                <td className="px-4 py-2">
                  {r.latenessStatus === 'LATE' ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Terlambat</span>
                  ) : r.latenessStatus === 'ON_TIME' ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Tepat waktu</span>
                  ) : (
                    <span className="text-xs text-slate-400">-</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {(() => {
                    const status = VALIDATION_LABEL[r.validationStatus] ?? { label: r.validationStatus, style: 'bg-slate-100 text-slate-600' };
                    return <span className={`rounded-full px-2 py-0.5 text-xs ${status.style}`}>{status.label}</span>;
                  })()}
                  {r.forgottenCheckout && <div className="mt-1 text-xs font-medium text-orange-700">Checkout otomatis: terlupa</div>}
                </td>
                {canCorrect && (
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => openCorrection(r)} className="text-xs font-medium text-slate-600 underline">
                      Koreksi
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canCorrect ? 7 : 6} className="px-4 py-6 text-center text-slate-400">Belum ada data absensi hari ini.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, style }: { label: string; value: number; style: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className={`text-2xl font-semibold ${style}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
