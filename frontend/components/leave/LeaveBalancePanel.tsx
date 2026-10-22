"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CalendarRange, History, Plus, SlidersHorizontal } from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";

interface BalanceTransaction {
  id: string;
  type: "ENTITLEMENT" | "APPROVED_LEAVE" | "MANUAL_ADJUSTMENT" | "REVERSAL";
  daysDelta: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
  actor: { name: string | null; email: string; role: string } | null;
}

interface LeaveBalance {
  id: string;
  year: number;
  entitlementDays: number;
  usedDays: number;
  remainingDays: number;
  transactions: BalanceTransaction[];
}

interface LeaveBalanceResponse {
  employee: { id: string; name: string; employeeNumber: string | null };
  balances: LeaveBalance[];
}

const transactionLabels: Record<BalanceTransaction["type"], string> = {
  ENTITLEMENT: "Inisialisasi hak tahunan",
  APPROVED_LEAVE: "Cuti disetujui",
  MANUAL_ADJUSTMENT: "Penyesuaian Admin HR",
  REVERSAL: "Pengembalian saldo",
};

function jakartaYear() {
  return Number(
    new Intl.DateTimeFormat("en", {
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(new Date()),
  );
}

export function LeaveBalancePanel({
  employeeId,
  canManage = false,
  className,
}: {
  employeeId?: string;
  canManage?: boolean;
  className?: string;
}) {
  const [data, setData] = useState<LeaveBalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"initialize" | "adjust" | null>(null);
  const [form, setForm] = useState({
    year: String(jakartaYear()),
    value: "",
    reason: "",
  });

  const endpoint = employeeId
    ? `/leave-balances/employees/${employeeId}`
    : "/leave-balances/me";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<LeaveBalanceResponse>(endpoint));
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Gagal memuat saldo cuti",
      );
    } finally {
      setLoading(false);
    }
  }, [endpoint]);
  useEffect(() => {
    void load();
  }, [load]);

  function openInitialize() {
    setForm({ year: String(jakartaYear()), value: "", reason: "" });
    setDialog("initialize");
    setError(null);
  }

  function openAdjust(year: number) {
    setForm({ year: String(year), value: "", reason: "" });
    setDialog("adjust");
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!employeeId || !dialog) return;
    setBusy(true);
    setError(null);
    try {
      const initializing = dialog === "initialize";
      const result = await apiFetch<LeaveBalanceResponse>(
        `${endpoint}/${initializing ? "initialize" : "adjust"}`,
        {
          method: initializing ? "POST" : "PATCH",
          body: initializing
            ? {
                year: Number(form.year),
                entitlementDays: Number(form.value),
                reason: form.reason.trim(),
              }
            : {
                year: Number(form.year),
                delta: Number(form.value),
                reason: form.reason.trim(),
              },
        },
      );
      setData(result);
      setDialog(null);
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Gagal menyimpan saldo cuti",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <Skeleton className={cn("h-48 rounded-xl", className)} />;
  }

  return (
    <section
      id="leave-balance"
      aria-labelledby="leave-balance-title"
      className={cn(
        "min-w-0 rounded-xl border border-border bg-paper p-4 shadow-none sm:p-5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption font-semibold text-muted">CUTI TAHUNAN</p>
          <h2 id="leave-balance-title" className="mt-1 text-section-title text-brand">
            Saldo Cuti
          </h2>
          {data?.employee && (
            <p className="mt-1 break-words text-body text-muted [overflow-wrap:anywhere]">
              {data.employee.name}
              {data.employee.employeeNumber
                ? ` · ${data.employee.employeeNumber}`
                : ""}
            </p>
          )}
        </div>
        {canManage && (
          <Button type="button" size="sm" onClick={openInitialize}>
            <Plus className="size-4" />
            Inisialisasi Tahun
          </Button>
        )}
      </div>

      {error && <Alert variant="danger" className="mt-4">{error}</Alert>}

      {data && data.balances.length > 0 ? (
        <div className="mt-4 space-y-3">
          {data.balances.map((balance) => (
            <article
              key={balance.id}
              className="min-w-0 rounded-xl bg-surface-subtle p-3 sm:p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 font-bold text-brand">
                  <CalendarRange className="size-4" />
                  Periode {balance.year}
                </p>
                {canManage && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => openAdjust(balance.year)}
                  >
                    <SlidersHorizontal className="size-4" />
                    Sesuaikan
                  </Button>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-3 divide-x divide-border rounded-lg bg-paper py-3 text-center">
                <BalanceMetric label="Hak tahunan" value={balance.entitlementDays} />
                <BalanceMetric label="Terpakai" value={balance.usedDays} />
                <BalanceMetric label="Sisa" value={balance.remainingDays} emphasized />
              </dl>
              {balance.transactions.length > 0 && (
                <details className="mt-3 border-t border-border pt-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-body font-semibold text-brand">
                    <History className="size-4" />
                    Riwayat saldo ({balance.transactions.length})
                  </summary>
                  <div className="divide-y divide-border">
                    {balance.transactions.map((transaction) => (
                      <div key={transaction.id} className="min-w-0 py-3 text-caption">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words font-semibold text-foreground [overflow-wrap:anywhere]">
                              {transactionLabels[transaction.type]}
                            </p>
                            <p className="mt-1 break-words text-muted [overflow-wrap:anywhere]">
                              {transaction.reason || "Tanpa catatan"}
                            </p>
                          </div>
                          <span className={cn("shrink-0 font-bold tabular-nums", transaction.daysDelta >= 0 ? "text-success" : "text-danger") }>
                            {transaction.daysDelta > 0 ? "+" : ""}{transaction.daysDelta} hari
                          </span>
                        </div>
                        <p className="mt-1 break-words text-muted [overflow-wrap:anywhere]">
                          Saldo setelah transaksi: {transaction.balanceAfter} hari · {transaction.actor?.name ?? transaction.actor?.email ?? "Sistem"} · {formatDateTime(transaction.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </article>
          ))}
        </div>
      ) : data ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center">
          <p className="font-semibold text-brand">Saldo cuti belum diatur</p>
          <p className="mt-1 text-body text-muted">
            {canManage
              ? "Inisialisasi hak cuti tahunan agar karyawan dapat mengajukan CUTI."
              : "Saldo cuti Anda belum diatur oleh Admin HR. Silakan hubungi HR."}
          </p>
        </div>
      ) : null}

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && !busy && setDialog(null)}
      >
        <DialogContent
          showClose={!busy}
          aria-busy={busy}
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}
        >
          <DialogTitle>
            {dialog === "initialize" ? "Inisialisasi Saldo Cuti" : "Sesuaikan Saldo Cuti"}
          </DialogTitle>
          <DialogDescription>
            {dialog === "initialize"
              ? "Buat hak cuti untuk satu tahun yang belum memiliki saldo."
              : "Tambahkan atau kurangi hak dan sisa cuti dengan delta yang sama. Cuti terpakai tidak berubah."}
          </DialogDescription>
          {error && <Alert variant="danger" className="mt-4">{error}</Alert>}
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-foreground">
              Tahun / periode
              <input
                required
                type="number"
                min="2000"
                max="2100"
                readOnly={dialog === "adjust"}
                value={form.year}
                onChange={(event) => setForm({ ...form, year: event.target.value })}
                className="input mt-1 w-full"
              />
            </label>
            <label className="block text-sm font-semibold text-foreground">
              {dialog === "initialize" ? "Hak cuti awal (hari)" : "Delta penyesuaian (hari)"}
              <input
                required
                type="number"
                min={dialog === "initialize" ? "0" : undefined}
                step="1"
                value={form.value}
                onChange={(event) => setForm({ ...form, value: event.target.value })}
                placeholder={dialog === "initialize" ? "Contoh: 12" : "Contoh: 2 atau -1"}
                className="input mt-1 w-full"
              />
            </label>
            <label className="block text-sm font-semibold text-foreground">
              Alasan
              <textarea
                required
                minLength={3}
                rows={3}
                value={form.reason}
                onChange={(event) => setForm({ ...form, reason: event.target.value })}
                className="input mt-1 w-full"
                placeholder="Jelaskan dasar inisialisasi atau penyesuaian"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Batal
              </Button>
              <Button
                disabled={
                  busy ||
                  !form.value ||
                  Number(form.value) === 0 && dialog === "adjust" ||
                  form.reason.trim().length < 3
                }
              >
                {busy ? "Menyimpan..." : "Simpan Saldo"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function BalanceMetric({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: number;
  emphasized?: boolean;
}) {
  return (
    <div className="min-w-0 px-2">
      <dt className="break-words text-caption font-semibold text-muted [overflow-wrap:anywhere]">{label}</dt>
      <dd className={cn("mt-1 text-xl font-bold tabular-nums", emphasized ? "text-success" : "text-brand")}>
        {value}
        <span className="ml-1 text-caption font-medium text-muted">hari</span>
      </dd>
    </div>
  );
}
