'use client';

import Link from 'next/link';
import { ArrowLeft, Clock3 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import { useSession } from '@/components/providers/SessionProvider';
import { ActionDialog } from '@/components/ui/action-dialog';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { ContextBand, DataRegion, DossierPage } from '@/components/ui/dossier';

interface OvertimeRequest {
  id: string;
  requestedById: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  status: string;
  reviewNote: string | null;
  employee: { id: string; name: string };
}
const STATUS: Record<string, string> = {
  PENDING: 'Menunggu review',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
};
function toDateTime(date: string, time: string) {
  return date && time ? new Date(`${date}T${time}`).toISOString() : '';
}

export default function OvertimeRequestsPage() {
  const { session } = useSession();
  const role = session.role;
  const canSubmit = role === 'KARYAWAN' || role === 'KOORDINATOR';
  const canReview =
    role === 'KOORDINATOR' || role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const isHr = role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const isEmployee = role === 'KARYAWAN';
  const [rows, setRows] = useState<OvertimeRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [decision, setDecision] = useState<{
    row: OvertimeRequest;
    approve: boolean;
  } | null>(null);
  const [form, setForm] = useState({
    date: '',
    startTime: '',
    endTime: '',
    reason: '',
  });
  async function load() {
    try {
      setRows(await apiFetch<OvertimeRequest[]>('/overtime-requests'));
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : 'Gagal memuat pengajuan lembur',
      );
    }
  }
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1')
      document.getElementById('overtime-form')?.scrollIntoView();
    void load();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/overtime-requests', {
        method: 'POST',
        body: {
          date: form.date,
          startTime: toDateTime(form.date, form.startTime),
          endTime: toDateTime(form.date, form.endTime),
          reason: form.reason,
        },
      });
      setForm({ date: '', startTime: '', endTime: '', reason: '' });
      await load();
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : 'Gagal mengirim pengajuan lembur',
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function review(note: string) {
    if (!decision) return;
    setSubmitting(true);
    try {
      await apiFetch(`/overtime-requests/${decision.row.id}/review`, {
        method: 'PATCH',
        body: { approve: decision.approve, note: note || undefined },
      });
      setDecision(null);
      await load();
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : 'Gagal mereview pengajuan lembur',
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function cancel(id: string) {
    try {
      await apiFetch(`/overtime-requests/${id}/cancel`, { method: 'PATCH' });
      await load();
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : 'Gagal membatalkan pengajuan lembur',
      );
    }
  }
  const controls = (row: OvertimeRequest) => {
    const own = row.requestedById === session.id;
    return (
      <div className="flex flex-wrap gap-2">
        {canReview && !own && row.status === 'PENDING' && (
          <>
            <Button
              size="sm"
              onClick={() => setDecision({ row, approve: true })}
            >
              Setujui
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setDecision({ row, approve: false })}
            >
              Tolak
            </Button>
          </>
        )}
        {row.status === 'PENDING' && (own || isHr) && (
          <Button size="sm" variant="secondary" onClick={() => cancel(row.id)}>
            Batalkan
          </Button>
        )}
      </div>
    );
  };

  return (
    <DossierPage className={isEmployee ? 'max-w-5xl' : ''}>
      {isEmployee && (
        <Link
          href="/requests"
          className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand"
        >
          <ArrowLeft className="size-4" />
          Kembali ke Pengajuan
        </Link>
      )}
      <ContextBand title="Pengajuan Lembur" description={isEmployee ? 'Catat waktu dan alasan lembur sesuai pekerjaan Anda.' : 'Tinjau pengajuan lembur sesuai cakupan kewenangan Anda.'} meta={<span>{isEmployee ? 'PRIBADI' : 'WORK QUEUE · LEMBUR'}</span>} />
      {error && <Alert variant="danger" title="Pengajuan lembur tidak dapat diproses" className="mb-4">{error}</Alert>}
      {canSubmit && (
        <form
          id="overtime-form"
          onSubmit={submit}
          aria-busy={submitting}
          className="mb-6 grid max-w-xl gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card"
        >
          <label className="text-sm font-semibold text-foreground">
            Tanggal
            <input
              required
              type="date"
              value={form.date}
              onChange={(event) =>
                setForm({ ...form, date: event.target.value })
              }
              className="input mt-1 w-full"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold text-foreground">
              Mulai
              <input
                required
                type="time"
                value={form.startTime}
                onChange={(event) =>
                  setForm({ ...form, startTime: event.target.value })
                }
                className="input mt-1 w-full"
              />
            </label>
            <label className="text-sm font-semibold text-foreground">
              Selesai
              <input
                required
                type="time"
                value={form.endTime}
                onChange={(event) =>
                  setForm({ ...form, endTime: event.target.value })
                }
                className="input mt-1 w-full"
              />
            </label>
          </div>
          <label className="text-sm font-semibold text-foreground">
            Alasan
            <textarea
              required
              minLength={3}
              rows={3}
              value={form.reason}
              onChange={(event) =>
                setForm({ ...form, reason: event.target.value })
              }
              className="input mt-1 w-full"
            />
          </label>
          <Button disabled={submitting}>
            {submitting ? 'Mengirim...' : 'Ajukan Lembur'}
          </Button>
        </form>
      )}
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <article
            key={row.id}
            className="overflow-hidden rounded-xl bg-paper p-4 shadow-card"
          >
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-xl bg-info-surface text-info">
                <Clock3 className="size-5" />
              </span>
              <StatusBadge status={STATUS[row.status] ?? row.status} />
            </div>
            <p className="mt-3 font-bold text-navy">{row.employee.name}</p>
            <p className="mt-1 text-sm text-slate-500">
              {formatDate(row.date)} · {formatTime(row.startTime)} -{' '}
              {formatTime(row.endTime)}
            </p>
            <p className="mt-3 text-sm">{row.reason}</p>
            {row.reviewNote && (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                {row.reviewNote}
              </p>
            )}
            <div className="mt-4">{controls(row)}</div>
          </article>
        ))}
        {!rows.length && <EmptyState title="Belum ada pengajuan lembur" />}
      </div>
        <DataRegion className="hidden md:block">
         <table className="min-w-[760px] text-sm">
           <thead>
            <tr>
              <th scope="col" className="px-4 py-3">Karyawan</th>
              <th scope="col" className="px-4 py-3">Waktu</th>
              <th scope="col" className="px-4 py-3">Alasan</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t align-top">
                <td className="px-4 py-3 font-semibold">{row.employee.name}</td>
                <td className="px-4 py-3">
                  {formatDate(row.date)}
                  <div className="text-xs text-slate-500">
                    {formatTime(row.startTime)} - {formatTime(row.endTime)}
                    </div>
                </td>
                <td className="px-4 py-3">{row.reason}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={STATUS[row.status] ?? row.status} />
                </td>
                <td className="px-4 py-3">{controls(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <EmptyState title="Belum ada pengajuan lembur" />}
      </DataRegion>
      <ActionDialog
        open={!!decision}
        title={
          decision?.approve
            ? 'Setujui pengajuan lembur?'
            : 'Tolak pengajuan lembur?'
        }
        description="Koordinator tidak dapat mereview pengajuan yang dibuatnya sendiri."
        reasonLabel={
          decision?.approve ? 'Catatan persetujuan' : 'Alasan penolakan'
        }
        reasonRequired={!decision?.approve}
        danger={!decision?.approve}
        busy={submitting}
        onClose={() => setDecision(null)}
        onConfirm={review}
      />
    </DossierPage>
  );
}
