'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useSession } from '@/components/providers/SessionProvider';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { StatusBadge } from '@/components/ui/badge';
import { ContextBand, DossierPage } from '@/components/ui/dossier';

type Request = {
  id: string;
  status: string;
  requestedAt: string;
  requestedChanges: { proposed?: Record<string, string>; reason?: string };
  employee?: { name: string };
};

export default function ProfileChangeRequestsPage() {
  const { session } = useSession();
  const isEmployee = session.role === 'KARYAWAN';
  const isHr = session.role === 'ADMIN_HR' || session.role === 'SYSTEM_ADMIN';
  const [requests, setRequests] = useState<Request[]>([]);
  const [reviewRequests, setReviewRequests] = useState<Request[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    address: '',
    phone: '',
    email: '',
    bankAccountNumber: '',
    reason: '',
  });
  const [decision, setDecision] = useState<{
    request: Request;
    value: 'APPROVED' | 'REJECTED';
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      const [own, review] = await Promise.all([
        isEmployee
          ? apiFetch<Request[]>('/employees/me/profile-change-requests')
          : Promise.resolve([]),
        isHr
          ? apiFetch<Request[]>(
              '/employee-profile-change-requests?status=PENDING',
            )
          : Promise.resolve([]),
      ]);
      setRequests(own);
      setReviewRequests(review);
    } catch (reason) {
      setError(
        reason instanceof ApiError ? reason.message : 'Gagal memuat pengajuan',
      );
    }
  }
  useEffect(() => {
    void load();
  }, [session.role]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const changes = Object.fromEntries(
      Object.entries(form).filter(([key, value]) => key !== 'reason' && value),
    );
    try {
      await apiFetch('/employees/me/profile-change-requests', {
        method: 'POST',
        body: { changes, reason: form.reason },
      });
      setForm({
        address: '',
        phone: '',
        email: '',
        bankAccountNumber: '',
        reason: '',
      });
      await load();
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : 'Gagal mengirim pengajuan',
      );
    }
  }
  async function review(note: string) {
    if (!decision) return;
    setBusy(true);
    try {
      await apiFetch(
        `/employee-profile-change-requests/${decision.request.id}/review`,
        {
          method: 'PATCH',
          body: { decision: decision.value, reviewNote: note || undefined },
        },
      );
      setDecision(null);
      await load();
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : 'Gagal meninjau pengajuan',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!isEmployee && !isHr)
    return (
      <EmptyState
        title="Perubahan profil tidak tersedia"
        description="Kebijakan saat ini membatasi pengajuan mandiri kepada Karyawan dan review kepada HR."
      />
    );

  return (
    <DossierPage className="max-w-5xl space-y-5">
      <ContextBand title="Pengajuan Perubahan Profil" description={isEmployee ? 'Ajukan perubahan data yang didukung untuk ditinjau HR.' : 'Tinjau perubahan profil Karyawan yang menunggu keputusan.'} meta={<span>{isEmployee ? 'PRIBADI' : 'WORK QUEUE · DATA PROFIL'}</span>} />
      {error && <Alert variant="danger" title="Pengajuan profil tidak dapat diproses">{error}</Alert>}
      {isEmployee && (
        <Card>
          <CardHeader>
            <CardTitle>Data yang Diajukan</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Alamat baru"
                value={form.address}
                onChange={(value) => setForm({ ...form, address: value })}
              />
              <Field
                label="Nomor WhatsApp/telepon"
                value={form.phone}
                onChange={(value) => setForm({ ...form, phone: value })}
              />
              <Field
                label="Email pribadi"
                type="email"
                value={form.email}
                onChange={(value) => setForm({ ...form, email: value })}
              />
              <Field
                label="Rekening bank"
                value={form.bankAccountNumber}
                onChange={(value) =>
                  setForm({ ...form, bankAccountNumber: value })
                }
              />
              <label className="text-sm font-semibold text-foreground sm:col-span-2">
                Alasan perubahan
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
              <Button className="sm:col-span-2">Kirim Pengajuan</Button>
            </form>
          </CardContent>
        </Card>
      )}
      {isEmployee && <RequestList title="Riwayat Saya" requests={requests} />}
      {isHr && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-navy">Menunggu Review</h2>
          {reviewRequests.length ? (
            <div className="space-y-3">
              {reviewRequests.map((request) => (
                <Card key={request.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-navy [overflow-wrap:anywhere]">
                          {request.employee?.name ?? 'Karyawan'}
                        </p>
                        <p className="mt-1 text-caption tabular-nums text-muted">
                          Diajukan {formatDate(request.requestedAt)}
                        </p>
                        <p className="mt-3 break-words text-body text-foreground [overflow-wrap:anywhere]">
                          {changesText(request)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            setDecision({ request, value: 'APPROVED' })
                          }
                        >
                          Setujui
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            setDecision({ request, value: 'REJECTED' })
                          }
                        >
                          Tolak
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Tidak ada pengajuan"
              description="Tidak ada perubahan profil yang menunggu review."
            />
          )}
        </section>
      )}
      <ActionDialog
        open={!!decision}
        title={
          decision?.value === 'APPROVED'
            ? 'Setujui perubahan profil?'
            : 'Tolak perubahan profil?'
        }
        description="Keputusan akan dicatat pada riwayat review yang sudah ada."
        reasonLabel={
          decision?.value === 'REJECTED' ? 'Alasan penolakan' : 'Catatan review'
        }
        reasonRequired={decision?.value === 'REJECTED'}
        danger={decision?.value === 'REJECTED'}
        busy={busy}
        onClose={() => setDecision(null)}
        onConfirm={review}
      />
    </DossierPage>
  );
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-semibold text-foreground">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input mt-1 w-full"
      />
    </label>
  );
}
function RequestList({
  title,
  requests,
}: {
  title: string;
  requests: Request[];
}) {
  return (
    <section>
      <h2 className="mb-3 text-section-title text-brand">{title}</h2>
      {requests.length ? (
        <div className="space-y-3">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardContent className="min-w-0 p-4">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-brand [overflow-wrap:anywhere]">
                    {changesText(request)}
                  </p>
                  <p className="mt-1 text-caption tabular-nums text-muted">
                    {formatDate(request.requestedAt)}
                  </p>
                  <StatusBadge status={request.status} className="mt-2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="Belum ada pengajuan" />
      )}
    </section>
  );
}
function changesText(request: Request) {
  const entries = Object.entries(request.requestedChanges?.proposed ?? {});
  return entries.length
    ? entries.map(([key, value]) => `${key}: ${value}`).join(', ')
    : 'Perubahan data profil';
}
