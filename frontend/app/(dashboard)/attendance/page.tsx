'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch, ApiError, protectedMediaUrl } from '@/lib/api';
import { getToken } from '@/lib/auth';
import AttendanceMap from '@/components/AttendanceMap';
import { useSession } from '@/components/providers/SessionProvider';
import { formatFullDate, formatTime } from '@/lib/format';
import { Alert, ErrorState } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { useAttendancePresentation } from '@/components/attendance/AttendancePresentationContext';
import { PeopleAttendanceMonitoring } from '@/components/attendance/PeopleAttendanceMonitoring';
import { ContextBand, DataRegion, DossierPage, IndexTabs, MobileRecord, RecordActions, RecordBody, RecordHeader, WorkSheet } from '@/components/ui/dossier';
import { approvedAbsenceLabel, type ApprovedFullDayAbsence, type AttendanceMode, type AttendanceRecord } from '@/lib/attendance';
import { CalendarDays, Camera, CheckCircle2, Fingerprint, LocateFixed, MapPin, ShieldCheck } from 'lucide-react';

const VALIDATION_LABEL: Record<string, { label: string; style: string }> = {
  VALID: { label: 'Valid', style: 'bg-slate-100 text-slate-600' },
  NEEDS_REVIEW: { label: 'Perlu ditinjau', style: 'bg-yellow-100 text-yellow-700' },
  APPROVED_AFTER_REVIEW: { label: 'Disetujui setelah tinjauan', style: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Ditolak', style: 'bg-red-100 text-red-700' },
};

interface TodayResponse {
  attendance: AttendanceRecord | null;
  attendanceMode: AttendanceMode;
  expectedLocation: { id: string; name: string; latitude: number | null; longitude: number | null; radiusMeters: number };
  nonWorkingDay: { reason: 'HOLIDAY' | 'WEEKDAY'; label: string; weekday: number; holiday: { id: string; name: string; type: string } | null } | null;
  approvedAbsence: ApprovedFullDayAbsence | null;
}

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export default function AttendancePage() {
  const { session } = useSession();
  const searchParams = useSearchParams();
  const presentation = useAttendancePresentation();
  const role = session.role;
  const canMonitor = ['ADMIN_HR', 'SYSTEM_ADMIN', 'KOORDINATOR', 'DIREKTUR'].includes(role ?? '');
  const canSelfCheckIn = !!session.employee
    && session.employee.attendanceRequired
    && session.employee.status === 'ACTIVE'
    && !!session.employee.activePlacementName;
  const authorityView = role === 'KOORDINATOR' ? 'team' : 'organization';
  const requestedView = searchParams.get('view');
  const view = requestedView === authorityView || requestedView === 'team' || requestedView === 'organization' ? authorityView : canSelfCheckIn ? 'mine' : authorityView;

  if (!canSelfCheckIn && !canMonitor) {
    return <p className="text-sm text-slate-500">Akun ini belum memiliki profil karyawan aktif yang wajib absensi.</p>;
  }
  if (presentation.captureOnly) return canSelfCheckIn ? <SelfCheckIn showHistory={false} autoStart onCompleted={presentation.onCompleted} overlay /> : null;
  if (!canMonitor) return <SelfCheckIn />;
  return <DossierPage className="min-w-0 space-y-6">
    {canSelfCheckIn && <IndexTabs><nav aria-label="Konteks presensi" className="flex min-w-max"><Link href="/attendance?view=mine" className={`relative min-h-11 px-4 py-3 text-sm font-semibold after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 ${view === 'mine' ? 'text-brand after:bg-accent' : 'text-muted after:bg-transparent hover:text-brand'}`}>Pribadi</Link><Link href={`/attendance?view=${authorityView}`} className={`relative min-h-11 px-4 py-3 text-sm font-semibold after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 ${view === authorityView ? 'text-brand after:bg-accent' : 'text-muted after:bg-transparent hover:text-brand'}`}>{authorityView === 'team' ? 'Tim' : 'Organisasi'}</Link></nav></IndexTabs>}
    {view === 'mine' && canSelfCheckIn ? <SelfCheckIn showHistory /> : <PeopleAttendanceMonitoring role={role} context={authorityView} />}
  </DossierPage>;
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

function readQueue(key: string): QueuedItem[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(key: string, items: QueuedItem[]) {
  localStorage.setItem(key, JSON.stringify(items));
}

function isLikelyNetworkError(err: unknown): boolean {
  // Validation/conflict responses are final outcomes. Authentication,
  // throttling, server, and transport failures retain evidence for retry.
  return !(err instanceof ApiError) || err.status === 403 || err.status === 408 || err.status === 429 || err.status >= 500;
}

// ---------------------------------------------------------------------
// Self-service check-in/out (Karyawan) — §11.1
// ---------------------------------------------------------------------
function SelfCheckIn({ showHistory = true, autoStart = false, overlay = false, onCompleted }: { showHistory?: boolean; autoStart?: boolean; overlay?: boolean; onCompleted?: (action: 'check-in' | 'check-out') => void }) {
  const { session } = useSession();
  const queueKey = `${QUEUE_KEY}:${session.employee?.id ?? session.id}`;
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [detail, setDetail] = useState<AttendanceRecord | null>(null);
  const [position, setPosition] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [locationState, setLocationState] = useState<'searching' | 'available' | 'denied' | 'unavailable'>('searching');
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
  const mountedRef = useRef(true);
  const autoStartedRef = useRef(false);

  async function load() {
    try {
      const [data, historyData] = await Promise.all([
        apiFetch<TodayResponse>('/attendance/me/today', { token: getToken() }),
        showHistory ? apiFetch<AttendanceRecord[]>('/attendance/me/history', { token: getToken() }) : Promise.resolve([]),
      ]);
      setToday(data);
      setHistory(historyData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat status absensi');
    }
    setQueueCount(readQueue(queueKey).length);
  }

  useEffect(() => {
    mountedRef.current = true;
    load();
    window.addEventListener('online', flushQueue);
    window.addEventListener('attendance-updated', load);
    return () => {
      mountedRef.current = false;
      stopCamera();
      window.removeEventListener('online', flushQueue);
      window.removeEventListener('attendance-updated', load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoStart || !today || today.approvedAbsence || autoStartedRef.current || today.attendance?.checkOutAt) return;
    autoStartedRef.current = true;
    void startCamera(today.attendance?.checkInAt ? 'check-out' : 'check-in');
  }, [autoStart, today]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationState('unavailable');
      return;
    }
    setLocationState('searching');
    let watchId = 0;
    watchId = navigator.geolocation.watchPosition(
      (result) => {
        setPosition({ latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: result.coords.accuracy });
        setLocationState('available');
      },
      (failure) => {
        setPosition(null);
        setLocationState(failure.code === failure.PERMISSION_DENIED ? 'denied' : 'unavailable');
        navigator.geolocation.clearWatch(watchId);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (cameraOn && !cameraFailed && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOn, cameraFailed]);

  async function flushQueue() {
    const queue = readQueue(queueKey);
    if (queue.length === 0) return;
    setInfo('Menyinkronkan data absensi offline...');
    const remaining: QueuedItem[] = [];
    const rejected: string[] = [];
    for (const item of queue) {
      try {
        await apiFetch(item.path, { method: item.method, token: getToken(), body: item.body });
      } catch (err) {
        if (isLikelyNetworkError(err)) {
          remaining.push(item); // still offline, try again later
        } else {
          rejected.push(err instanceof ApiError ? err.message : 'Ditolak server');
        }
        // else: server rejected it for real (e.g. already checked in from
        // another session) — drop it, nothing more we can do with it.
      }
    }
    writeQueue(queueKey, remaining);
    setQueueCount(remaining.length);
    setInfo(remaining.length === 0 && rejected.length === 0 ? 'Semua data absensi offline berhasil disinkronkan.' : null);
    if (rejected.length > 0) setError(`${rejected.length} data absensi offline ditolak server: ${rejected[0]}`);
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
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
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
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    });
  }

  async function submit() {
    if (!mode || !today) return;
    if (today.approvedAbsence) {
      setError('Presensi tidak tersedia selama ketidakhadiran penuh yang telah disetujui.');
      return;
    }
    if (today.attendanceMode === 'GEOFENCE' && (today.expectedLocation.latitude === null || today.expectedLocation.longitude === null)) {
      setError('Koordinat lokasi kerja belum dikonfigurasi. Hubungi Admin HR sebelum melakukan presensi Geofence.');
      return;
    }
    if (!cameraFailed && (!videoRef.current?.videoWidth || !videoRef.current?.videoHeight)) {
      setError('Kamera masih menyiapkan gambar. Tunggu sebentar lalu coba lagi.');
      return;
    }
    const attendanceMode = today.attendanceMode;
    setBusy(true);
    setError(null);
    setInfo(null);
    let capturedBody: Record<string, unknown> = {};
    try {
      const selfieBase64 = capturePhoto() ?? undefined;

      let latitude: number | undefined;
      let longitude: number | undefined;
      let accuracyMeters: number | undefined;
      let gpsFailedNow = gpsFailed;
      try {
        // Submission always captures a fresh fix; the live map position is informational only.
        const pos = await getPosition();
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        accuracyMeters = pos.coords.accuracy;
        gpsFailedNow = false;
        setGpsFailed(false);
        setPosition({ latitude, longitude, accuracy: accuracyMeters });
        setLocationState('available');
      } catch {
        gpsFailedNow = true;
        setGpsFailed(true);
        if (attendanceMode === 'MOBILE') {
          setError('Mode MOBILE mewajibkan GPS aktif. Koordinat baru tidak berhasil diambil, jadi absensi tidak dikirim atau disimpan offline.');
          return;
        }
      }

      const needsFailureNote = cameraFailed || gpsFailedNow;
      if (needsFailureNote && failureNote.trim().length < 3) {
        setError('GPS atau kamera gagal. Tuliskan alasan singkat agar tetap bisa absen (akan ditinjau HR).');
        setBusy(false);
        return;
      }

      capturedBody = {
        latitude,
        longitude,
        accuracyMeters,
        selfieBase64,
      };
      if (needsFailureNote) {
        capturedBody.failureReason = cameraFailed && gpsFailedNow ? 'OTHER' : cameraFailed ? 'CAMERA_FAILED' : 'GPS_FAILED';
        capturedBody.failureNote = failureNote.trim();
      }

      const path = mode === 'check-in' ? '/attendance/check-in' : '/attendance/check-out';
      const method = mode === 'check-in' ? 'POST' : 'PATCH';

      if (!navigator.onLine) {
        throw new Error('OFFLINE');
      }

      try {
        await apiFetch(path, { method, token: getToken(), body: capturedBody });
      } catch (err) {
        if (isLikelyNetworkError(err)) throw new Error('OFFLINE');
        throw err;
      }

      const completedMode = mode;
      stopCamera();
      setMode(null);
      await load();
      setInfo(`${completedMode === 'check-in' ? 'Check-in' : 'Check-out'} berhasil`);
      onCompleted?.(completedMode);
    } catch (err) {
      if (err instanceof Error && err.message === 'OFFLINE') {
        const hasCapturedCoordinates = typeof capturedBody.latitude === 'number' && typeof capturedBody.longitude === 'number';
        if (attendanceMode === 'MOBILE' && !hasCapturedCoordinates) {
          setError('Absensi MOBILE tidak dapat disimpan offline tanpa koordinat GPS yang sudah diambil.');
          return;
        }
        // §11.5 "absensi offline" — queue it locally; clientRecordedAt marks
        // this as the real moment the employee attempted to record it.
        const queue = readQueue(queueKey);
        const queuedAt = new Date().toISOString();
        const selfieBase64 = capturePhoto() ?? undefined;
        queue.push({
          id: crypto.randomUUID(),
          path: mode === 'check-in' ? '/attendance/check-in' : '/attendance/check-out',
          method: mode === 'check-in' ? 'POST' : 'PATCH',
          body: {
            ...capturedBody,
            selfieBase64: capturedBody.selfieBase64 ?? selfieBase64,
            failureReason: capturedBody.failureReason ?? (cameraFailed || gpsFailed ? (cameraFailed ? 'CAMERA_FAILED' : 'GPS_FAILED') : undefined),
            failureNote: capturedBody.failureNote ?? (failureNote.trim() || undefined),
            clientRecordedAt: queuedAt,
          },
          queuedAt,
        });
        writeQueue(queueKey, queue);
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
        return <ErrorState retry={load} />;
      }
    return <div className="space-y-4"><Skeleton className="h-16 w-72 max-w-full" /><Skeleton className="h-80 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div>;
  }

  const att = today.attendance;
  const isMobile = today.attendanceMode === 'MOBILE';
  const workPoint = today.expectedLocation.latitude !== null && today.expectedLocation.longitude !== null
    ? { latitude: today.expectedLocation.latitude, longitude: today.expectedLocation.longitude }
    : null;
  const liveDistance = workPoint && position ? distanceMeters(workPoint, position) : null;
  const poorAccuracy = !!position && position.accuracy > Math.max(50, isMobile ? 100 : today.expectedLocation.radiusMeters);
  const locationStatus = locationState === 'denied' ? 'Izin lokasi ditolak'
    : locationState === 'unavailable' ? 'Layanan lokasi tidak tersedia'
      : locationState === 'searching' ? 'Mengambil GPS baru...'
        : !isMobile && !workPoint ? 'Koordinat lokasi kerja belum dikonfigurasi'
          : poorAccuracy ? 'GPS diperoleh, tetapi akurasi masih rendah'
            : isMobile ? 'GPS diperoleh'
              : liveDistance! <= today.expectedLocation.radiusMeters ? 'Di dalam radius' : 'Di luar radius';

  async function openDetail(id: string) {
    try {
      setDetail(await apiFetch<AttendanceRecord>(`/attendance/${id}`, { token: getToken() }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat detail absensi');
    }
  }

  if (today.approvedAbsence) {
    const label = approvedAbsenceLabel(today.approvedAbsence.type);
    if (overlay) return (
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col items-center justify-center text-center sm:min-h-0 sm:py-12">
        <span className="grid size-24 place-items-center rounded-full bg-info-surface text-info">
          <CalendarDays className="size-11" />
        </span>
        <h2 className="mt-6 text-2xl font-bold text-brand">{label} Disetujui</h2>
        <p className="mt-2 max-w-sm text-body text-muted">
          Presensi tidak tersedia karena ketidakhadiran penuh Anda telah disetujui.
        </p>
        <StatusBadge status="APPROVED" label={label} className="mt-5" />
      </div>
    );
    return (
      <div className={`mx-auto w-full min-w-0 max-w-5xl ${overlay ? 'flex min-h-full flex-col' : ''}`}>
        <ContextBand title="Presensi Hari Ini" description={formatFullDate(new Date())} meta={<span>DISETUJUI</span>} className={overlay ? 'mb-4' : undefined} />
        <Alert variant="info" title={`${label} disetujui`}>
          Hari ini tercakup {label.toLowerCase()} penuh yang telah disetujui. Check-in dan check-out tidak tersedia, dan Anda tidak dihitung sebagai Alpha atau Belum Hadir.
        </Alert>
        <WorkSheet className="mt-4" title="Status Hari Ini">
          <div className="flex min-w-0 items-center justify-between gap-4">
            <span className="text-sm text-muted">Status ketidakhadiran</span>
            <StatusBadge status="APPROVED" label={label} />
          </div>
          {showHistory && <Button asChild variant="secondary" className="mt-5 w-full sm:w-auto"><Link href="/attendance/history?view=mine">Lihat riwayat presensi</Link></Button>}
        </WorkSheet>
      </div>
    );
  }

  if (overlay && att?.checkInAt && att.checkOutAt) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col items-center justify-center text-center sm:min-h-0 sm:py-12">
        <span className="grid size-24 place-items-center rounded-full bg-success-surface text-success">
          <CheckCircle2 className="size-12" strokeWidth={2.5} />
        </span>
        <h2 className="mt-6 text-2xl font-bold text-brand">Presensi Hari Ini Selesai</h2>
        <p className="mt-2 max-w-sm text-body text-muted">
          Check-in dan check-out sudah tercatat. Tidak ada presensi lain yang perlu dilakukan hari ini.
        </p>
        <div className="mt-6 grid w-full grid-cols-2 divide-x divide-border overflow-hidden rounded-xl bg-surface-subtle py-4">
          <div>
            <p className="text-caption font-semibold text-muted">Check-in</p>
            <p className="mt-1 font-bold tabular-nums text-brand">{formatTime(att.checkInAt)}</p>
          </div>
          <div>
            <p className="text-caption font-semibold text-muted">Check-out</p>
            <p className="mt-1 font-bold tabular-nums text-brand">{formatTime(att.checkOutAt)}</p>
          </div>
        </div>
        <StatusBadge status={att.validationStatus} label={VALIDATION_LABEL[att.validationStatus]?.label} className="mt-5" />
        <DialogClose asChild>
          <Button size="lg" className="mt-8 w-full">Selesai</Button>
        </DialogClose>
        <DialogClose asChild>
          <Button asChild variant="ghost" className="mt-2 w-full">
            <Link href="/attendance/history?view=mine">Lihat Riwayat Presensi</Link>
          </Button>
        </DialogClose>
      </div>
    );
  }

  if (overlay) {
    const outsideRadius = !isMobile && liveDistance !== null && liveDistance > today.expectedLocation.radiusMeters;
    const locationReady = locationState === 'available' && !poorAccuracy && !outsideRadius && (isMobile || !!workPoint);
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col sm:min-h-0">
        <header className="px-7 pb-4 pt-2 text-center">
          <h2 className="text-xl font-bold text-brand">
            {mode === 'check-out' ? 'Absen Pulang' : 'Absen Masuk'}
          </h2>
          <p className="mt-1 text-caption text-muted">
            Pastikan wajah, GPS, dan lokasi kerja siap.
          </p>
        </header>

        {cameraOn ? (
          <div className="mx-auto mb-5 grid size-[15rem] place-items-center overflow-hidden rounded-full border-[6px] border-paper bg-brand shadow-[0_0_0_2px_#E2DFD9,0_14px_35px_rgba(0,31,63,0.16)]">
            {!cameraFailed ? (
              <video ref={videoRef} autoPlay playsInline muted className="size-full -scale-x-100 object-cover" />
            ) : (
              <div className="px-8 text-center text-white">
                <Camera className="mx-auto size-10" />
                <p className="mt-3 text-sm font-semibold">Kamera tidak tersedia</p>
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto mb-5 grid size-32 place-items-center rounded-full bg-brand text-white shadow-lift">
            <Fingerprint className="size-14" />
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />

        <div className="space-y-2 rounded-xl border border-border bg-paper p-3 shadow-card">
          <CaptureCheck
            icon={MapPin}
            label="Lokasi terdeteksi"
            detail={today.expectedLocation.name}
            ready={locationState === 'available'}
          />
          <CaptureCheck
            icon={LocateFixed}
            label={isMobile ? 'GPS aktif' : outsideRadius ? 'Di luar jangkauan' : 'Dalam jangkauan'}
            detail={isMobile ? (position ? `Akurasi ${Math.round(position.accuracy)} meter` : locationStatus) : liveDistance === null ? locationStatus : `Jarak ${Math.round(liveDistance)} dari radius ${today.expectedLocation.radiusMeters} meter`}
            ready={locationReady}
          />
          <CaptureCheck
            icon={Camera}
            label={cameraFailed ? 'Kamera gagal' : cameraOn ? 'Wajah terlihat' : 'Kamera belum aktif'}
            detail={cameraFailed ? 'Isi alasan untuk melanjutkan' : cameraOn ? 'Siap untuk presensi' : 'Aktifkan kamera untuk verifikasi'}
            ready={cameraOn && !cameraFailed}
          />
        </div>

        {outsideRadius && (
          <Alert className="mt-3" variant="danger">
            Anda berada di luar radius lokasi kerja. Presensi tidak dapat diproses sebelum lokasi valid.
          </Alert>
        )}
        {cameraFailed && (
          <textarea
            placeholder="Alasan kamera gagal (wajib diisi)"
            value={failureNote}
            onChange={(event) => setFailureNote(event.target.value)}
            aria-label="Alasan GPS atau kamera gagal"
            className="mt-3 min-h-20 w-full rounded-lg border border-border bg-paper px-3 py-2 text-sm"
            rows={2}
          />
        )}
        {error && <Alert className="mt-3" variant="danger">{error}</Alert>}
        {info && <Alert className="mt-3" variant={info.includes('berhasil') ? 'success' : 'info'}>{info}</Alert>}

        <div className="mt-auto grid gap-2 pt-5">
          {!cameraOn ? (
            <Button size="lg" onClick={() => startCamera(att?.checkInAt ? 'check-out' : 'check-in')}>
              Mulai Verifikasi
            </Button>
          ) : (
            <Button size="lg" onClick={submit} disabled={busy || outsideRadius}>
              {busy ? 'Memproses presensi...' : `Proses ${mode === 'check-out' ? 'Check-out' : 'Check-in'}`}
            </Button>
          )}
          {cameraOn && (
            <Button
              variant="secondary"
              onClick={() => {
                stopCamera();
                setMode(null);
              }}
            >
              Batal
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`mx-auto w-full min-w-0 max-w-5xl ${overlay ? 'flex min-h-full flex-col' : ''}`}>
      <ContextBand title="Presensi Hari Ini" description={`${formatFullDate(att?.date ?? new Date())} · ${today.expectedLocation.name}`} meta={<span>{isMobile ? 'MODE MOBILE' : 'MODE GEOFENCE'}</span>} className={overlay ? 'mb-4' : undefined} />

      {today.nonWorkingDay && <Alert className="mb-4" variant="info"><strong className="block text-navy">Hari ini tidak ada jadwal kerja</strong><span className="mt-1 block">{today.nonWorkingDay.label}. Presensi khusus tetap tersedia dan otomatis ditandai untuk ditinjau.</span></Alert>}

      <WorkSheet className="mb-4">
        <AttendanceMap work={isMobile ? null : workPoint} current={position} radiusMeters={today.expectedLocation.radiusMeters} showGeofence={!isMobile} className="h-52 sm:h-64" />
        <div className="mt-3 grid min-w-0 gap-2 text-sm sm:grid-cols-2">
          <p className="min-w-0 break-words [overflow-wrap:anywhere]"><span className="text-slate-500">Mode absensi:</span> {isMobile ? 'Mobile' : 'Geofence'}</p>
          <p className="min-w-0 break-words [overflow-wrap:anywhere]"><span className="text-slate-500">Lokasi kerja:</span> {today.expectedLocation.name}</p>
          {isMobile ? <p className="min-w-0 break-words tabular-nums [overflow-wrap:anywhere]"><span className="text-slate-500">Koordinat saat ini:</span> {position ? `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}` : '-'}</p> : <>
            <p><span className="text-slate-500">Radius:</span> {today.expectedLocation.radiusMeters} m</p>
            <p><span className="text-slate-500">Jarak saat ini:</span> {liveDistance === null ? '-' : `${Math.round(liveDistance)} m`}</p>
          </>}
          <p><span className="text-slate-500">Akurasi GPS:</span> {position ? `${Math.round(position.accuracy)} m` : '-'}</p>
          <p className={`font-medium ${locationState !== 'available' || poorAccuracy || (!isMobile && (!workPoint || (liveDistance !== null && liveDistance > today.expectedLocation.radiusMeters))) ? 'text-red-700' : 'text-green-700'}`}>{locationStatus}</p>
        </div>
        <p className="mt-2 text-xs text-slate-500">{isMobile ? 'Mode MOBILE tidak menerapkan radius tetap. Setiap check-in/check-out wajib mengambil koordinat GPS baru; tanpa GPS, absensi tidak dapat dikirim atau disimpan offline.' : 'Lokasi diperbarui hanya selama halaman Absensi ini terbuka. Keputusan check-in/check-out tetap divalidasi ulang oleh server.'}</p>
      </WorkSheet>

      {queueCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          <span>{queueCount} absensi belum tersinkron.</span>
          <button onClick={flushQueue} className="font-medium underline">Sinkronkan sekarang</button>
        </div>
      )}
      {info && <Alert className="mb-4" variant={info.includes('berhasil') ? 'success' : 'info'}>{info}</Alert>}
      {error && <Alert className="mb-4" variant="danger">{error}</Alert>}

      <WorkSheet className="mb-4 text-sm">
        <div className="flex min-w-0 justify-between gap-4 py-1">
          <span className="text-slate-500">Masuk</span>
          <span className="shrink-0 tabular-nums">{formatTime(att?.checkInAt)}</span>
        </div>
        <div className="flex min-w-0 justify-between gap-4 py-1">
          <span className="text-slate-500">Pulang</span>
          <span className={`min-w-0 break-words text-right tabular-nums [overflow-wrap:anywhere] ${att?.checkInAt && !att?.checkOutAt ? 'font-medium text-red-600' : ''}`}>{att?.checkOutAt ? formatTime(att.checkOutAt) : att?.checkInAt ? 'Belum check-out' : '-'}</span>
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
      </WorkSheet>

      {!cameraOn && !att?.checkInAt && (
        <button onClick={() => startCamera('check-in')} className="min-h-11 w-full rounded-xl bg-brand py-2 text-sm font-semibold text-white hover:brightness-110">
          Check-in
        </button>
      )}
      {!cameraOn && att?.checkInAt && !att?.checkOutAt && (
        <button onClick={() => startCamera('check-out')} className="min-h-11 w-full rounded-xl bg-brand py-2 text-sm font-semibold text-white hover:brightness-110">
          Check-out
        </button>
      )}
      {!cameraOn && att?.checkInAt && att?.checkOutAt && (
        <p className="text-center text-sm text-green-600">Absensi hari ini sudah lengkap. Terima kasih!</p>
      )}

      {cameraOn && (
        <WorkSheet className={overlay ? 'order-first mb-4' : ''}>
          {!cameraFailed && (
            <video ref={videoRef} autoPlay playsInline muted className="mb-3 aspect-[4/3] max-w-full -scale-x-100 rounded-lg bg-black object-cover" />
          )}
          <canvas ref={canvasRef} className="hidden" />

          {cameraFailed && (
            <p className="mb-3 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              Kamera tidak bisa diakses. Anda tetap bisa absen tanpa foto, tapi wajib isi alasan di bawah — data ini akan ditinjau HR.
            </p>
          )}

          {isMobile && gpsFailed && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">GPS belum berhasil mengambil koordinat baru. Aktifkan izin lokasi lalu coba kembali.</p>
          )}

          {(cameraFailed || (!isMobile && gpsFailed)) && (
            <textarea
              placeholder="Alasan GPS/kamera gagal (wajib diisi)"
              value={failureNote}
              onChange={(e) => setFailureNote(e.target.value)}
              aria-label="Alasan GPS atau kamera gagal"
              className="mb-3 min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={2}
            />
          )}

          {!cameraFailed && (
            <p className="mb-3 text-xs text-slate-500">
              Kamera siap. Pastikan wajah terlihat jelas dan Anda mengizinkan akses lokasi saat diminta.
            </p>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <button
              onClick={submit}
              disabled={busy}
              className="min-h-11 flex-1 rounded-xl bg-brand py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              {busy ? 'Mengirim presensi...' : `${cameraFailed ? 'Kirim' : 'Ambil Foto &'} ${mode === 'check-in' ? 'Check-in' : 'Check-out'}`}
            </button>
            <button
              onClick={() => {
                stopCamera();
                setMode(null);
              }}
              className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        </WorkSheet>
      )}

      {showHistory && <div className="mt-8 min-w-0">
        <h2 className="mb-2 text-lg font-semibold">Riwayat Absensi</h2>
        {history.length === 0 ? <p className="rounded-xl bg-paper px-4 py-6 text-center text-body text-muted shadow-sheet">Belum ada riwayat absensi.</p> : <><div className="space-y-3 md:hidden">{history.map((record) => <SelfAttendanceHistoryRecord key={record.id} record={record} onOpen={openDetail} />)}</div><DataRegion className="hidden md:block"><table className="min-w-[640px] text-sm"><thead><tr><th scope="col">Tanggal</th><th scope="col">Masuk</th><th scope="col">Pulang</th><th scope="col">Validasi</th><th scope="col"><span className="sr-only">Tindakan</span></th></tr></thead><tbody>{history.map((record) => <tr key={record.id}><td className="whitespace-nowrap tabular-nums">{record.date ? new Date(record.date).toLocaleDateString('id-ID') : '-'}</td><td className="whitespace-nowrap tabular-nums">{record.checkInAt ? new Date(record.checkInAt).toLocaleTimeString('id-ID') : '-'}</td><td className="whitespace-nowrap tabular-nums">{record.checkOutAt ? new Date(record.checkOutAt).toLocaleTimeString('id-ID') : '-'}</td><td><StatusBadge status={record.validationStatus} label={VALIDATION_LABEL[record.validationStatus]?.label} /></td><td className="text-right"><button onClick={() => openDetail(record.id)} className="text-xs font-semibold text-brand underline">Detail</button></td></tr>)}</tbody></table></DataRegion></>}
      </div>}
      {showHistory && detail && <AttendanceDetail attendance={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function CaptureCheck({ icon: Icon, label, detail, ready }: { icon: typeof ShieldCheck; label: string; detail: string; ready: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg bg-surface-subtle px-3 py-2.5">
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${ready ? 'bg-success-surface text-success' : 'bg-danger-surface text-danger'}`}>
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-brand">{label}</span>
        <span className="block truncate text-caption text-muted">{detail}</span>
      </span>
      <CheckCircle2 className={`size-5 shrink-0 ${ready ? 'text-success' : 'text-danger'}`} />
    </div>
  );
}

function SelfAttendanceHistoryRecord({ record, onOpen }: { record: AttendanceRecord; onOpen: (id: string) => void }) {
  return <MobileRecord><RecordHeader title={record.date ? new Date(record.date).toLocaleDateString('id-ID') : '-'} detail={record.latenessStatus === 'LATE' ? 'Terlambat' : record.checkInAt ? 'Presensi tercatat' : 'Belum hadir'} status={<StatusBadge status={record.validationStatus} label={VALIDATION_LABEL[record.validationStatus]?.label} />} /><RecordBody><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="dossier-label">Masuk</dt><dd className="mt-1 font-semibold tabular-nums">{formatTime(record.checkInAt)}</dd></div><div><dt className="dossier-label">Pulang</dt><dd className="mt-1 font-semibold tabular-nums">{formatTime(record.checkOutAt)}</dd></div></dl></RecordBody><RecordActions><Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => onOpen(record.id)}>Lihat detail</Button></RecordActions></MobileRecord>;
}

function AttendanceDetail({ attendance, onClose }: { attendance: AttendanceRecord; onClose: () => void }) {
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="fixed inset-0 z-50 overflow-y-auto overscroll-contain max-w-none rounded-none sm:inset-auto sm:max-w-4xl sm:rounded-2xl"><DialogTitle>Detail Riwayat Absensi</DialogTitle><DialogDescription>{attendance.employee?.name ?? 'Absensi saya'} · {attendance.date ? new Date(attendance.date).toLocaleDateString('id-ID') : '-'}</DialogDescription>
    <div className="mb-4 grid gap-2 text-sm sm:grid-cols-3"><p><span className="text-slate-500">Status:</span> {attendance.latenessStatus}</p><p><span className="text-slate-500">Validasi:</span> {attendance.validationStatus}</p><p><span className="text-slate-500">Sumber checkout:</span> {attendance.checkOutSource ?? '-'}</p></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <EvidenceDetail title="Check-in" attendanceMode={attendance.checkInAttendanceMode} at={attendance.checkInAt} latitude={attendance.checkInLatitude} longitude={attendance.checkInLongitude} accuracy={attendance.checkInAccuracyMeters} distance={attendance.checkInDistanceMeters} gpsStatus={attendance.checkInGpsStatus} geofenceLatitude={attendance.checkInGeofenceLatitude} geofenceLongitude={attendance.checkInGeofenceLongitude} radius={attendance.checkInGeofenceRadiusMeters} locationName={attendance.checkInLocationName} selfieUrl={attendance.checkInSelfieUrl} />
      <EvidenceDetail title="Check-out" attendanceMode={attendance.checkOutAttendanceMode} at={attendance.checkOutAt} latitude={attendance.checkOutLatitude} longitude={attendance.checkOutLongitude} accuracy={attendance.checkOutAccuracyMeters} distance={attendance.checkOutDistanceMeters} gpsStatus={attendance.checkOutGpsStatus} geofenceLatitude={attendance.checkOutGeofenceLatitude} geofenceLongitude={attendance.checkOutGeofenceLongitude} radius={attendance.checkOutGeofenceRadiusMeters} locationName={attendance.checkOutLocationName} selfieUrl={attendance.checkOutSelfieUrl} />
    </div>
    <div className="mt-4 rounded-xl border border-slate-200 p-4 text-sm"><h3 className="font-semibold">Review</h3><p className="mt-1"><span className="text-slate-500">Waktu review:</span> {attendance.reviewedAt ? new Date(attendance.reviewedAt).toLocaleString('id-ID') : '-'}</p><p><span className="text-slate-500">Catatan:</span> {attendance.reviewNote ?? '-'}</p>{attendance.reviews?.map((review) => <p key={review.id} className="mt-2 border-t border-slate-100 pt-2">{review.decision} oleh {review.reviewer?.name ?? review.reviewer?.role ?? 'Reviewer'} · {new Date(review.reviewedAt).toLocaleString('id-ID')} · {review.note}</p>)}</div>
  </DialogContent></Dialog>;
}

function EvidenceDetail(props: { title: string; attendanceMode?: AttendanceMode | null; at?: string | null; latitude?: number | null; longitude?: number | null; accuracy?: number | null; distance?: number | null; gpsStatus?: string | null; geofenceLatitude?: number | null; geofenceLongitude?: number | null; radius?: number | null; locationName?: string | null; selfieUrl?: string | null }) {
  const work = props.geofenceLatitude !== null && props.geofenceLatitude !== undefined && props.geofenceLongitude !== null && props.geofenceLongitude !== undefined ? { latitude: props.geofenceLatitude, longitude: props.geofenceLongitude } : null;
  const point = props.latitude !== null && props.latitude !== undefined && props.longitude !== null && props.longitude !== undefined ? { latitude: props.latitude, longitude: props.longitude, accuracy: props.accuracy ?? 0 } : null;
  const isMobile = props.attendanceMode === 'MOBILE';
  const hasHistory = !!point && (isMobile || !!work);
  // eslint-disable-next-line @next/next/no-img-element
  return <section className="min-w-0 rounded-xl border border-slate-200 p-4"><h3 className="mb-2 font-semibold">{props.title}</h3><div className="min-w-0 space-y-1 text-sm [&_p]:break-words [&_p]:[overflow-wrap:anywhere]"><p><span className="text-slate-500">Waktu:</span> {props.at ? new Date(props.at).toLocaleString('id-ID') : '-'}</p><p><span className="text-slate-500">Mode:</span> {props.attendanceMode === 'MOBILE' ? 'Mobile' : props.attendanceMode === 'GEOFENCE' ? 'Geofence' : '-'}</p><p><span className="text-slate-500">Lokasi:</span> {props.locationName ?? 'Lokasi historis tidak tersedia'}</p><p className="tabular-nums"><span className="text-slate-500">Koordinat:</span> {point ? `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}` : 'Lokasi historis tidak tersedia'}</p><p><span className="text-slate-500">Akurasi:</span> {props.accuracy === null || props.accuracy === undefined ? '-' : `${Math.round(props.accuracy)} m`}</p><p><span className="text-slate-500">Jarak:</span> {isMobile ? 'Tidak berlaku (tanpa radius tetap)' : props.distance === null || props.distance === undefined ? '-' : `${Math.round(props.distance)} m`}</p><p><span className="text-slate-500">Status GPS:</span> {props.gpsStatus ?? '-'}</p></div>{hasHistory ? <div className="mt-3 min-w-0"><AttendanceMap work={isMobile ? null : work} current={point} radiusMeters={props.radius ?? 0} showGeofence={!isMobile} /></div> : <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Lokasi historis tidak tersedia</p>}{props.selfieUrl && <img src={protectedMediaUrl(props.selfieUrl)} alt={`Selfie ${props.title}`} className="mt-3 h-32 w-32 max-w-full rounded-lg object-cover" />}</section>;
}
