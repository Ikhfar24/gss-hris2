"use client";

import {
  createContext,
  FormEvent,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { ApiError, apiFetch, downloadFile } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useSession } from "@/components/providers/SessionProvider";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";

type RunStatus = "DRAFT" | "PENDING_DIRECTOR_APPROVAL" | "FINALIZED";
interface Run {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: RunStatus;
  _count: { slips: number };
  financeReviewedAt?: string | null;
  sourceMonitorOnly?: boolean;
}
interface Item {
  id: string;
  type: "EARNING" | "DEDUCTION";
  label: string;
  amount: number;
  note?: string | null;
}
interface Slip {
  id: string;
  employee: { id: string; name: string };
  basis: "CONTRACT" | "DAILY_RATE";
  baseSalary: number;
  dailyRate?: number | null;
  presentDays?: number | null;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  items: Item[];
}
interface Payment {
  id: string;
  amount: number;
  reference: string;
  paidAt: string;
  reason: string;
}
interface RunDetail extends Run {
  slips: Slip[];
  payments: Payment[];
  skipped?: string[];
}
interface Cycle {
  id: string;
  clientId?: string | null;
  locationId?: string | null;
  client?: { name: string } | null;
  location?: { name: string } | null;
  startDay: number;
  endDay: number;
  isActive: boolean;
}
interface Period {
  id: string;
  cycleSettingId: string;
  periodStart: string;
  periodEnd: string;
  status: "OPEN" | "CLOSED";
  payrollRun?: { id: string; status: RunStatus } | null;
  cycleSetting: Cycle;
}
interface Revision {
  id: string;
  payrollRunId: string;
  revisionNumber: number;
  status: string;
  reason: string;
  netAdjustment: number;
  approvalNote?: string | null;
  items: {
    id: string;
    payrollSlipId: string;
    type: "EARNING" | "DEDUCTION";
    label: string;
    amount: number;
    reason: string;
  }[];
  payrollRun: { periodStart: string; periodEnd: string; status: RunStatus };
}
interface MySlip {
  id: string;
  netPay: number;
  payrollRun: { periodStart: string; periodEnd: string };
}
type FinanceConfirmation = { title: string; requireReason?: boolean };
const FinanceConfirmContext = createContext<
  (request: FinanceConfirmation) => Promise<string | null>
>(async () => null);

const money = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;
const date = (value: string) => formatDate(value);
const periodLabel = (run: { periodStart: string; periodEnd: string }) =>
  `${date(run.periodStart)} - ${date(run.periodEnd)}`;
const errorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;
const statusLabel: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_DIRECTOR_APPROVAL: "Menunggu Direktur",
  FINALIZED: "Final",
  OPEN: "Terbuka",
  CLOSED: "Ditutup",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};
const button =
  "inline-flex min-h-10 items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9";

export default function PayrollPage() {
  const { session } = useSession();
  const searchParams = useSearchParams();
  const role = session.role;
  // prettier-ignore
  if (searchParams.get('view') === 'mine' && session.employee)
    return <MySlips />;
  if (role === "KARYAWAN" || role === "MARKETING")
    return session.employee ? (
      <MySlips />
    ) : (
      <p className="rounded-xl bg-paper p-4 text-body text-muted shadow-sheet">
        Akun ini belum terhubung ke data karyawan.
      </p>
    );
  if (role === "KEUANGAN")
    return (
      <FinanceConfirmProvider>
        <FinancePayroll />
      </FinanceConfirmProvider>
    );
  if (role === "DIREKTUR") return <DirectorApprovals />;
  if (role === "ADMIN_HR") return <HrMonitor />;
  return (
    <p className="rounded-xl bg-paper p-4 text-body text-muted shadow-sheet">
      Anda tidak memiliki akses ke payroll.
    </p>
  );
}

function MySlips() {
  const [slips, setSlips] = useState<MySlip[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiFetch<MySlip[]>("/payroll/my-slips", { token: getToken() })
      .then(setSlips)
      .catch((e) => setError(errorMessage(e, "Gagal memuat slip gaji")));
  }, []);
  async function exportSlip(id: string) {
    try {
      await downloadFile(
        `/payroll/slips/${id}/export`,
        getToken(),
        "slip-gaji.pdf",
      );
    } catch (e) {
      setError(errorMessage(e, "Gagal mengunduh slip"));
    }
  }
  return (
    <section className="mx-auto min-w-0 max-w-7xl [&>header]:mb-4 [&>header]:pb-3">
      <PageHeader
        title="Slip Gaji Saya"
        description="Slip payroll final yang tersedia untuk akun Anda."
      />
      {error && <Notice message={error} />}
      {slips.length === 0 ? (
        <Empty text="Belum ada slip gaji yang sudah final." />
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {slips.map((slip) => (
            <article
              key={slip.id}
              className="min-w-0 rounded-xl bg-paper p-4 shadow-sheet"
            >
              <p className="break-words text-caption font-medium tabular-nums text-muted [overflow-wrap:anywhere]">
                {periodLabel(slip.payrollRun)}
              </p>
              <p className="mt-2 break-words text-xl font-bold tabular-nums text-brand [overflow-wrap:anywhere]">
                {money(slip.netPay)}
              </p>
              <Button
                className="mt-4 w-full sm:w-auto"
                onClick={() => exportSlip(slip.id)}
              >
                Unduh Slip PDF
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function HrMonitor() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiFetch<Run[]>("/payroll/runs", { token: getToken() })
      .then(setRuns)
      .catch((e) =>
        setError(errorMessage(e, "Gagal memuat monitoring payroll")),
      );
  }, []);
  return (
    <section className="mx-auto min-w-0 max-w-7xl [&>header]:mb-4 [&>header]:pb-3">
      <PageHeader
        title="Monitoring Payroll"
        description="HR hanya dapat memantau status dan jumlah slip payroll."
      />
      {error && <Notice message={error} />}
      <RunList runs={runs} selected={selected?.id} onSelect={setSelected} />
      {selected && (
        <div className="mt-3 min-w-0 rounded-xl border border-border bg-paper p-3 text-body sm:p-4">
          <p className="break-words font-semibold tabular-nums text-brand [overflow-wrap:anywhere]">
            {periodLabel(selected)}
          </p>
          <p className="mt-1 break-words text-muted [overflow-wrap:anywhere]">
            Status: {statusLabel[selected.status] ?? selected.status} ·{" "}
            {selected._count.slips} slip
          </p>
          <p className="mt-3 border-t border-border pt-3 text-caption text-muted">
            Rincian nominal dan tindakan payroll tidak tersedia untuk peran HR.
          </p>
        </div>
      )}
    </section>
  );
}

function DirectorApprovals() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [decision, setDecision] = useState<{
    kind: "run" | "revision";
    id: string;
    action: "approve" | "reject";
    title: string;
  } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    try {
      const [nextRuns, nextRevisions] = await Promise.all([
        apiFetch<Run[]>("/payroll/runs", { token: getToken() }),
        apiFetch<Revision[]>("/payroll-admin/revisions", { token: getToken() }),
      ]);
      setRuns(nextRuns);
      setRevisions(nextRevisions);
    } catch (e) {
      setError(errorMessage(e, "Gagal memuat persetujuan payroll"));
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function openRun(run: Run) {
    try {
      setDetail(
        await apiFetch<RunDetail>(`/payroll/runs/${run.id}`, {
          token: getToken(),
        }),
      );
    } catch (e) {
      setError(errorMessage(e, "Gagal memuat detail payroll"));
    }
  }
  async function submitDecision() {
    if (!decision || note.trim().length < 3) return;
    setSaving(true);
    try {
      const path =
        decision.kind === "run"
          ? `/payroll/runs/${decision.id}/${decision.action}`
          : `/payroll-admin/revisions/${decision.id}/${decision.action}`;
      await apiFetch(path, {
        method: "PATCH",
        token: getToken(),
        body:
          decision.kind === "run"
            ? { reason: note.trim() }
            : { note: note.trim() },
      });
      setDecision(null);
      setNote("");
      setDetail(null);
      await load();
    } catch (e) {
      setError(errorMessage(e, "Gagal memproses keputusan payroll"));
    } finally {
      setSaving(false);
    }
  }
  function openRunDecision(next: NonNullable<typeof decision>) {
    setDetail(null);
    setDecision(next);
  }
  const pendingRuns = runs.filter(
    (run) => run.status === "PENDING_DIRECTOR_APPROVAL",
  );
  const pendingRevisions = revisions.filter(
    (revision) => revision.status === "PENDING_DIRECTOR_APPROVAL",
  );
  return (
    <section className="mx-auto min-w-0 max-w-7xl">
      <header className="mb-4 border-b border-border pb-3">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-page-title text-brand [overflow-wrap:anywhere]">
              Persetujuan Payroll
            </h1>
            <p className="mt-1 max-w-3xl text-body text-muted">
              Buka rincian payroll sebelum mengambil keputusan final.
            </p>
          </div>
          <p className="w-fit shrink-0 rounded-md bg-brand px-2.5 py-1 text-caption font-semibold text-white">
            DIREKTUR
          </p>
        </div>
      </header>
      {error && <Notice message={error} />}
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        <Panel title="Payroll Menunggu Direktur">
          {pendingRuns.length ? (
            <div className="divide-y divide-border">
              {pendingRuns.map((run) => (
                <article key={run.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words font-semibold tabular-nums text-brand [overflow-wrap:anywhere]">
                        {periodLabel(run)}
                      </p>
                      <p className="mt-1 text-caption text-muted">
                        {run._count.slips} slip · {statusLabel[run.status]}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={() => openRun(run)}
                    >
                      Lihat Detail
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty text="Tidak ada payroll yang menunggu persetujuan." />
          )}
        </Panel>
        <Panel title="Revisi Menunggu Direktur">
          {pendingRevisions.length ? (
            <div className="divide-y divide-border">
              {pendingRevisions.map((revision) => (
                <article
                  key={revision.id}
                  className="min-w-0 py-3 first:pt-0 last:pb-0"
                >
                  <p className="break-words font-semibold tabular-nums text-brand [overflow-wrap:anywhere]">
                    Revisi #{revision.revisionNumber} ·{" "}
                    {periodLabel(revision.payrollRun)}
                  </p>
                  <p className="mt-1 text-body text-foreground">
                    Penyesuaian {money(revision.netAdjustment)}
                  </p>
                  <p className="mt-1 break-words text-caption text-muted [overflow-wrap:anywhere]">
                    {revision.reason}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() =>
                        setDecision({
                          kind: "revision",
                          id: revision.id,
                          action: "approve",
                          title: `Setujui revisi #${revision.revisionNumber}`,
                        })
                      }
                    >
                      Setujui
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      className="w-full sm:w-auto"
                      onClick={() =>
                        setDecision({
                          kind: "revision",
                          id: revision.id,
                          action: "reject",
                          title: `Tolak revisi #${revision.revisionNumber}`,
                        })
                      }
                    >
                      Tolak
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty text="Tidak ada revisi yang menunggu persetujuan." />
          )}
        </Panel>
      </div>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
          <DialogTitle>
            Detail Payroll · {detail ? periodLabel(detail) : ""}
          </DialogTitle>
          <DialogDescription>
            Nilai berasal dari snapshot backend dan tidak dihitung ulang di
            frontend.
          </DialogDescription>
          {detail && (
            <div className="mt-5">
              <div className="grid min-w-0 gap-2 sm:grid-cols-3">
                <Summary label="Karyawan" value={String(detail.slips.length)} />
                <Summary
                  label="Status"
                  value={statusLabel[detail.status] ?? detail.status}
                />
                <Summary
                  label="Total Final"
                  value={money(
                    detail.slips.reduce((sum, slip) => sum + slip.netPay, 0),
                  )}
                />
              </div>
              <div className="mt-4 min-w-0 divide-y divide-border overflow-hidden rounded-xl bg-surface-subtle">
                {detail.slips.map((slip) => (
                  <div key={slip.id} className="min-w-0 p-3 sm:p-4">
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-brand [overflow-wrap:anywhere]">
                          {slip.employee.name}
                        </p>
                        <p className="text-caption text-muted">
                          {slip.basis === "CONTRACT"
                            ? "Kontrak"
                            : `${slip.presentDays ?? 0} hari dibayar`}
                        </p>
                      </div>
                      <p className="break-words font-bold tabular-nums text-brand [overflow-wrap:anywhere] sm:text-right">
                        {money(slip.netPay)}
                      </p>
                    </div>
                    <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
                      <Summary
                        label="Pendapatan"
                        value={money(slip.baseSalary + slip.totalEarnings)}
                      />
                      <Summary
                        label="Potongan"
                        value={money(slip.totalDeductions)}
                      />
                      <Summary label="Final" value={money(slip.netPay)} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="danger"
                  className="w-full sm:w-auto"
                  onClick={() =>
                    openRunDecision({
                      kind: "run",
                      id: detail.id,
                      action: "reject",
                      title: "Tolak payroll",
                    })
                  }
                >
                  Tolak
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  onClick={() =>
                    openRunDecision({
                      kind: "run",
                      id: detail.id,
                      action: "approve",
                      title: "Setujui dan finalkan payroll",
                    })
                  }
                >
                  Setujui & Finalkan
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!decision}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setDecision(null);
            setNote("");
          }
        }}
      >
        <DialogContent
          showClose={!saving}
          aria-busy={saving}
          onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (saving) event.preventDefault(); }}
        >
          <DialogTitle>{decision?.title}</DialogTitle>
          <DialogDescription>
            Keputusan ini mengikuti tahap Direktur pada lifecycle payroll yang
            ada.
          </DialogDescription>
          <label className="mt-5 block text-sm font-semibold text-foreground">
            {decision?.action === "reject"
              ? "Alasan penolakan"
              : "Catatan keputusan"}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              className="input mt-2 w-full"
              placeholder="Minimal 3 karakter"
            />
          </label>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={saving} onClick={() => setDecision(null)}>
              Batal
            </Button>
            <Button
              variant={decision?.action === "reject" ? "danger" : "primary"}
              disabled={note.trim().length < 3 || saving}
              onClick={submitDecision}
            >
              {saving ? "Memproses..." : "Konfirmasi Keputusan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-subtle p-3">
      <p className="text-caption font-medium text-muted">{label}</p>
      <p className="mt-1 break-words text-body font-semibold tabular-nums text-navy [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}

function FinanceConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<FinanceConfirmation | null>(null);
  const [reason, setReason] = useState("");
  const resolver = useRef<((value: string | null) => void) | null>(null);
  function ask(next: FinanceConfirmation) {
    setReason("");
    setRequest(next);
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  }
  function close(value: string | null) {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
    setReason("");
  }
  return (
    <FinanceConfirmContext.Provider value={ask}>
      {children}
      <Dialog
        open={!!request}
        onOpenChange={(open) => {
          if (!open) close(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription>
            Tindakan ini menggunakan lifecycle payroll backend dan akan dicatat
            sesuai audit yang berlaku.
          </DialogDescription>
          {request?.requireReason && (
            <label className="mt-5 block text-sm font-semibold text-foreground">
              Alasan tindakan
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                className="input mt-2 w-full"
                placeholder="Minimal 3 karakter"
              />
            </label>
          )}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => close(null)}>
              Batal
            </Button>
            <Button
              disabled={!!request?.requireReason && reason.trim().length < 3}
              onClick={() => close(request?.requireReason ? reason.trim() : "")}
            >
              Konfirmasi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </FinanceConfirmContext.Provider>
  );
}

function FinancePayroll() {
  const confirmAction = useContext(FinanceConfirmContext);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<RunDetail | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [runForm, setRunForm] = useState({ periodStart: "", periodEnd: "" });
  const [cycleForm, setCycleForm] = useState({
    scope: "location",
    scopeId: "",
    startDay: "1",
    endDay: "31",
  });
  const [periodForm, setPeriodForm] = useState({
    cycleSettingId: "",
    periodStart: "",
    periodEnd: "",
  });
  const [itemForm, setItemForm] = useState({
    slipId: "",
    type: "DEDUCTION",
    label: "",
    amount: "",
    reason: "",
  });
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    reference: "",
    paidAt: "",
    reason: "",
  });
  const [revisionForm, setRevisionForm] = useState({
    slipId: "",
    type: "EARNING",
    label: "",
    amount: "",
    reason: "",
    itemReason: "",
  });
  async function load() {
    try {
      const [nextRuns, nextCycles, nextPeriods, nextRevisions] =
        await Promise.all([
          apiFetch<Run[]>("/payroll/runs", { token: getToken() }),
          apiFetch<Cycle[]>("/payroll-admin/cycle-settings", {
            token: getToken(),
          }),
          apiFetch<Period[]>("/payroll-admin/periods", { token: getToken() }),
          apiFetch<Revision[]>("/payroll-admin/revisions", {
            token: getToken(),
          }),
        ]);
      setRuns(nextRuns);
      setCycles(nextCycles);
      setPeriods(nextPeriods);
      setRevisions(nextRevisions);
    } catch (e) {
      setError(errorMessage(e, "Gagal memuat data payroll"));
    }
  }
  async function loadDetail(id: string) {
    try {
      setSelected(
        await apiFetch<RunDetail>(`/payroll/runs/${id}`, { token: getToken() }),
      );
    } catch (e) {
      setError(errorMessage(e, "Gagal memuat rincian payroll"));
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function createRun(e: FormEvent) {
    e.preventDefault();
    try {
      const run = await apiFetch<RunDetail>("/payroll/runs", {
        method: "POST",
        token: getToken(),
        body: runForm,
      });
      setRunForm({ periodStart: "", periodEnd: "" });
      await load();
      setSelected(run);
    } catch (e) {
      setError(errorMessage(e, "Gagal membuat payroll"));
    }
  }
  async function createCycle(e: FormEvent) {
    e.preventDefault();
    try {
      await apiFetch("/payroll-admin/cycle-settings", {
        method: "POST",
        token: getToken(),
        body: {
          startDay: Number(cycleForm.startDay),
          endDay: Number(cycleForm.endDay),
          [cycleForm.scope === "client" ? "clientId" : "locationId"]:
            cycleForm.scopeId,
        },
      });
      setCycleForm({
        scope: "location",
        scopeId: "",
        startDay: "1",
        endDay: "31",
      });
      await load();
    } catch (e) {
      setError(errorMessage(e, "Gagal menyimpan siklus payroll"));
    }
  }
  async function createPeriod(e: FormEvent) {
    e.preventDefault();
    try {
      await apiFetch("/payroll-admin/periods", {
        method: "POST",
        token: getToken(),
        body: periodForm,
      });
      setPeriodForm({ cycleSettingId: "", periodStart: "", periodEnd: "" });
      await load();
    } catch (e) {
      setError(errorMessage(e, "Gagal membuat periode payroll"));
    }
  }
  async function updateCycle(cycle: Cycle, data: Partial<Cycle>) {
    if (
      (await confirmAction({
        title: `${cycle.isActive ? "Nonaktifkan" : "Aktifkan"} siklus payroll ini?`,
      })) === null
    )
      return;
    try {
      await apiFetch(`/payroll-admin/cycle-settings/${cycle.id}`, {
        method: "PATCH",
        token: getToken(),
        body: data,
      });
      await load();
    } catch (e) {
      setError(errorMessage(e, "Gagal memperbarui siklus"));
    }
  }
  async function updatePeriod(period: Period, action: "close" | "reopen") {
    if (
      (await confirmAction({
        title: `${action === "close" ? "Tutup" : "Buka kembali"} periode payroll ini?`,
      })) === null
    )
      return;
    try {
      await apiFetch(`/payroll-admin/periods/${period.id}/${action}`, {
        method: "PATCH",
        token: getToken(),
      });
      await load();
    } catch (e) {
      setError(errorMessage(e, "Gagal memperbarui periode"));
    }
  }
  async function action(path: string, body?: unknown, confirmation?: string) {
    if (confirmation && (await confirmAction({ title: confirmation })) === null)
      return;
    try {
      await apiFetch(path, { method: "PATCH", token: getToken(), body });
      await load();
      if (selected) await loadDetail(selected.id);
    } catch (e) {
      setError(errorMessage(e, "Gagal memproses payroll"));
    }
  }
  async function addItem() {
    if (
      !itemForm.slipId ||
      !itemForm.label ||
      !itemForm.amount ||
      !itemForm.reason
    )
      return;
    try {
      await apiFetch(`/payroll/slips/${itemForm.slipId}/items`, {
        method: "POST",
        token: getToken(),
        body: {
          type: itemForm.type,
          label: itemForm.label,
          amount: Number(itemForm.amount),
          reason: itemForm.reason,
        },
      });
      setItemForm({
        slipId: "",
        type: "DEDUCTION",
        label: "",
        amount: "",
        reason: "",
      });
      if (selected) await loadDetail(selected.id);
    } catch (e) {
      setError(errorMessage(e, "Gagal menambah komponen manual"));
    }
  }
  async function removeItem(slipId: string, itemId: string) {
    const reason = await confirmAction({
      title: "Hapus komponen manual?",
      requireReason: true,
    });
    if (!reason) return;
    try {
      await apiFetch(`/payroll/slips/${slipId}/items/${itemId}`, {
        method: "DELETE",
        token: getToken(),
        body: { reason },
      });
      if (selected) await loadDetail(selected.id);
    } catch (e) {
      setError(errorMessage(e, "Gagal menghapus komponen"));
    }
  }
  async function recordPayment(e: FormEvent) {
    e.preventDefault();
    if (
      !selected ||
      (await confirmAction({ title: "Catat pembayaran payroll ini?" })) === null
    )
      return;
    try {
      await apiFetch(`/payroll/runs/${selected.id}/payments`, {
        method: "POST",
        token: getToken(),
        body: { ...paymentForm, amount: Number(paymentForm.amount) },
      });
      setPaymentForm({ amount: "", reference: "", paidAt: "", reason: "" });
      await loadDetail(selected.id);
    } catch (e) {
      setError(errorMessage(e, "Gagal mencatat pembayaran"));
    }
  }
  async function createRevision(e: FormEvent) {
    e.preventDefault();
    if (
      !selected ||
      (await confirmAction({
        title: "Buat revisi terpisah untuk payroll FINAL ini?",
      })) === null
    )
      return;
    try {
      await apiFetch(`/payroll-admin/runs/${selected.id}/revisions`, {
        method: "POST",
        token: getToken(),
        body: {
          reason: revisionForm.reason,
          items: [
            {
              payrollSlipId: revisionForm.slipId,
              type: revisionForm.type,
              label: revisionForm.label,
              amount: Number(revisionForm.amount),
              reason: revisionForm.itemReason,
            },
          ],
        },
      });
      setRevisionForm({
        slipId: "",
        type: "EARNING",
        label: "",
        amount: "",
        reason: "",
        itemReason: "",
      });
      await load();
    } catch (e) {
      setError(errorMessage(e, "Gagal membuat revisi"));
    }
  }
  return (
    <section className="mx-auto min-w-0 max-w-7xl [&>header]:mb-4 [&>header]:pb-3">
      <PageHeader
        title="Payroll Keuangan"
        description="Kelola siklus, periode, proses payroll, pembayaran, dan revisi."
      />
      {error && <Notice message={error} />}
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        <Panel title="Pengaturan Siklus">
          <form
            onSubmit={createCycle}
            className="grid min-w-0 gap-2 sm:grid-cols-2"
          >
            <select
              value={cycleForm.scope}
              onChange={(e) =>
                setCycleForm({ ...cycleForm, scope: e.target.value })
              }
              className="input"
            >
              <option value="location">ID Lokasi</option>
              <option value="client">ID Klien</option>
            </select>
            <input
              required
              value={cycleForm.scopeId}
              onChange={(e) =>
                setCycleForm({ ...cycleForm, scopeId: e.target.value })
              }
              placeholder="UUID cakupan"
              className="input"
            />
            <input
              required
              type="number"
              min="1"
              max="31"
              value={cycleForm.startDay}
              onChange={(e) =>
                setCycleForm({ ...cycleForm, startDay: e.target.value })
              }
              placeholder="Hari mulai"
              className="input"
            />
            <input
              required
              type="number"
              min="1"
              max="31"
              value={cycleForm.endDay}
              onChange={(e) =>
                setCycleForm({ ...cycleForm, endDay: e.target.value })
              }
              placeholder="Hari akhir"
              className="input"
            />
            <button
              className={`${button} border-brand bg-brand text-white hover:bg-binder-deep sm:col-span-2`}
            >
              Simpan Siklus
            </button>
          </form>
          <div className="mt-4 divide-y divide-border border-t border-border text-caption">
            {cycles.map((cycle) => (
              <div
                key={cycle.id}
                className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 break-words text-foreground [overflow-wrap:anywhere]">
                  {cycle.client?.name ?? cycle.location?.name ?? "Cakupan"}: tgl{" "}
                  {cycle.startDay}-{cycle.endDay} ·{" "}
                  {cycle.isActive ? "Aktif" : "Nonaktif"}
                </span>
                <button
                  onClick={() =>
                    updateCycle(cycle, { isActive: !cycle.isActive })
                  }
                  className="min-h-10 shrink-0 self-start rounded-md px-2 font-semibold text-brand underline hover:bg-surface-subtle sm:min-h-8 sm:self-center"
                >
                  {cycle.isActive ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Periode Payroll">
          <form
            onSubmit={createPeriod}
            className="grid min-w-0 gap-2 sm:grid-cols-3"
          >
            <select
              required
              value={periodForm.cycleSettingId}
              onChange={(e) =>
                setPeriodForm({ ...periodForm, cycleSettingId: e.target.value })
              }
              className="input"
            >
              <option value="">Pilih siklus</option>
              {cycles
                .filter((cycle) => cycle.isActive)
                .map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.client?.name ?? cycle.location?.name ?? cycle.id}
                  </option>
                ))}
            </select>
            <input
              required
              type="date"
              value={periodForm.periodStart}
              onChange={(e) =>
                setPeriodForm({ ...periodForm, periodStart: e.target.value })
              }
              className="input"
            />
            <input
              required
              type="date"
              value={periodForm.periodEnd}
              onChange={(e) =>
                setPeriodForm({ ...periodForm, periodEnd: e.target.value })
              }
              className="input"
            />
            <button
              className={`${button} border-brand bg-brand text-white hover:bg-binder-deep sm:col-span-3`}
            >
              Buat Periode
            </button>
          </form>
          <div className="mt-4 divide-y divide-border border-t border-border text-caption">
            {periods.map((period) => (
              <div
                key={period.id}
                className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 break-words tabular-nums text-foreground [overflow-wrap:anywhere]">
                  {periodLabel(period)} · {statusLabel[period.status]}
                </span>
                {period.status === "OPEN" ? (
                  <button
                    onClick={() => updatePeriod(period, "close")}
                    className="min-h-10 shrink-0 self-start rounded-md px-2 font-semibold text-brand underline hover:bg-surface-subtle sm:min-h-8 sm:self-center"
                  >
                    Tutup
                  </button>
                ) : (
                  <button
                    onClick={() => updatePeriod(period, "reopen")}
                    className="min-h-10 shrink-0 self-start rounded-md px-2 font-semibold text-brand underline hover:bg-surface-subtle sm:min-h-8 sm:self-center"
                  >
                    Buka kembali
                  </button>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Buat Payroll" className="mt-3">
        <form
          onSubmit={createRun}
          className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <input
            required
            type="date"
            value={runForm.periodStart}
            onChange={(e) =>
              setRunForm({ ...runForm, periodStart: e.target.value })
            }
            className="input"
          />
          <input
            required
            type="date"
            value={runForm.periodEnd}
            onChange={(e) =>
              setRunForm({ ...runForm, periodEnd: e.target.value })
            }
            className="input"
          />
          <button
            className={`${button} border-brand bg-brand text-white hover:bg-binder-deep`}
          >
            Buat dan Generate Slip
          </button>
        </form>
      </Panel>
      <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <RunList
          runs={runs}
          selected={selected?.id}
          onSelect={(run) => loadDetail(run.id)}
        />
        <div className="min-w-0">
          {selected && (
            <FinanceDetail
              selected={selected}
              revisions={revisions.filter(
                (revision) => revision.payrollRunId === selected.id,
              )}
              itemForm={itemForm}
              setItemForm={setItemForm}
              paymentForm={paymentForm}
              setPaymentForm={setPaymentForm}
              revisionForm={revisionForm}
              setRevisionForm={setRevisionForm}
              onAction={action}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onPayment={recordPayment}
              onRevision={createRevision}
            />
          )}
          {!selected && (
            <Empty text="Pilih payroll untuk melihat rincian dan tindakan." />
          )}
        </div>
      </div>
    </section>
  );
}

function FinanceDetail(props: {
  selected: RunDetail;
  revisions: Revision[];
  itemForm: any;
  setItemForm: any;
  paymentForm: any;
  setPaymentForm: any;
  revisionForm: any;
  setRevisionForm: any;
  onAction: (
    path: string,
    body?: unknown,
    confirmation?: string,
  ) => Promise<void>;
  onAddItem: () => Promise<void>;
  onRemoveItem: (slipId: string, itemId: string) => Promise<void>;
  onPayment: (e: FormEvent) => Promise<void>;
  onRevision: (e: FormEvent) => Promise<void>;
}) {
  const { selected, revisions } = props;
  const [submitReason, setSubmitReason] = useState("");
  return (
    <>
      <Panel title={periodLabel(selected)}>
        <div className="flex min-w-0 flex-col gap-2 text-body sm:flex-row sm:flex-wrap sm:items-center">
          <span className="w-fit rounded-full bg-info-surface px-2.5 py-1 text-caption font-semibold text-info">
            {statusLabel[selected.status]}
          </span>
          <span className="text-muted">{selected.slips.length} slip</span>
          {selected.status === "DRAFT" && (
            <button
              onClick={() =>
                props.onAction(`/payroll/runs/${selected.id}/review`)
              }
              className={`${button} border-border bg-paper text-brand hover:bg-surface-subtle`}
            >
              Tandai Review
            </button>
          )}
          {selected.status === "DRAFT" && (
            <>
              <input
                required
                value={submitReason}
                onChange={(e) => setSubmitReason(e.target.value)}
                placeholder="Alasan pengajuan"
                className="input min-w-0 flex-1"
              />
              <button
                disabled={!submitReason.trim()}
                onClick={() =>
                  props.onAction(
                    `/payroll/runs/${selected.id}/submit`,
                    { reason: submitReason },
                    "Kirim payroll ke Direktur untuk persetujuan?",
                  )
                }
                className={`${button} border-brand bg-brand text-white hover:bg-binder-deep`}
              >
                Ajukan ke Direktur
              </button>
            </>
          )}
          {selected.status === "FINALIZED" && (
            <button
              onClick={() =>
                downloadFile(
                  `/payroll/runs/${selected.id}/export?format=xlsx`,
                  getToken(),
                  "rekap-payroll.xlsx",
                )
              }
              className={`${button} border-border bg-paper text-brand hover:bg-surface-subtle`}
            >
              Ekspor Excel
            </button>
          )}
        </div>
        {selected.skipped?.length ? (
          <p className="mt-3 rounded-lg border border-warning-border bg-warning-surface px-3 py-2 text-caption text-warning">
            Tidak dibuatkan slip: {selected.skipped.join(", ")}
          </p>
        ) : null}
      </Panel>
      <div className="mt-3 min-w-0 space-y-2">
        {selected.slips.map((slip) => (
          <article
            key={slip.id}
            className="min-w-0 rounded-xl border border-border bg-paper p-3"
          >
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="break-words font-semibold text-brand [overflow-wrap:anywhere]">
                  {slip.employee.name}
                </p>
                <p className="break-words text-caption text-muted [overflow-wrap:anywhere]">
                  {slip.basis === "CONTRACT"
                    ? "Kontrak"
                    : `Harian: ${slip.presentDays ?? 0} hari x ${money(slip.dailyRate ?? 0)}`}{" "}
                  · Pokok {money(slip.baseSalary)}
                </p>
              </div>
              <p className="break-words font-bold tabular-nums text-brand [overflow-wrap:anywhere] sm:text-right">
                {money(slip.netPay)}
              </p>
            </div>
            {slip.items.map((item) => (
              <div
                key={item.id}
                className="mt-2 flex min-w-0 flex-col gap-1 border-t border-border pt-2 text-caption sm:flex-row sm:items-start sm:justify-between"
              >
                <span className="min-w-0 break-words text-foreground [overflow-wrap:anywhere]">
                  {item.type === "EARNING" ? "+" : "-"} {item.label} ·{" "}
                  {money(item.amount)}
                  {item.note ? ` (${item.note})` : ""}
                </span>
                {selected.status === "DRAFT" && (
                  <button
                    onClick={() => props.onRemoveItem(slip.id, item.id)}
                    className="min-h-10 shrink-0 self-start rounded-md px-2 font-semibold text-danger underline sm:min-h-8"
                  >
                    Hapus
                  </button>
                )}
              </div>
            ))}
          </article>
        ))}
      </div>
      {selected.status === "DRAFT" && (
        <Panel title="Komponen Manual" className="mt-3">
          <div className="grid min-w-0 gap-2 sm:grid-cols-3">
            <select
              value={props.itemForm.slipId}
              onChange={(e) =>
                props.setItemForm({ ...props.itemForm, slipId: e.target.value })
              }
              className="input"
            >
              <option value="">Pilih slip</option>
              {selected.slips.map((slip) => (
                <option key={slip.id} value={slip.id}>
                  {slip.employee.name}
                </option>
              ))}
            </select>
            <select
              value={props.itemForm.type}
              onChange={(e) =>
                props.setItemForm({ ...props.itemForm, type: e.target.value })
              }
              className="input"
            >
              <option value="EARNING">Tambahan</option>
              <option value="DEDUCTION">Potongan</option>
            </select>
            <input
              value={props.itemForm.label}
              onChange={(e) =>
                props.setItemForm({ ...props.itemForm, label: e.target.value })
              }
              placeholder="Komponen"
              className="input"
            />
            <input
              type="number"
              min="1"
              value={props.itemForm.amount}
              onChange={(e) =>
                props.setItemForm({ ...props.itemForm, amount: e.target.value })
              }
              placeholder="Nominal"
              className="input"
            />
            <input
              value={props.itemForm.reason}
              onChange={(e) =>
                props.setItemForm({ ...props.itemForm, reason: e.target.value })
              }
              placeholder="Alasan wajib"
              className="input"
            />
            <button
              disabled={
                !props.itemForm.slipId ||
                !props.itemForm.label ||
                !props.itemForm.amount ||
                !props.itemForm.reason
              }
              onClick={props.onAddItem}
              className={`${button} border-brand bg-brand text-white hover:bg-binder-deep`}
            >
              Tambah Komponen
            </button>
          </div>
        </Panel>
      )}
      {selected.status === "FINALIZED" && (
        <>
          <Panel title="Catat Pembayaran" className="mt-3">
            <form
              onSubmit={props.onPayment}
              className="grid min-w-0 gap-2 sm:grid-cols-2"
            >
              <input
                required
                type="number"
                min="1"
                value={props.paymentForm.amount}
                onChange={(e) =>
                  props.setPaymentForm({
                    ...props.paymentForm,
                    amount: e.target.value,
                  })
                }
                placeholder="Nominal"
                className="input"
              />
              <input
                required
                value={props.paymentForm.reference}
                onChange={(e) =>
                  props.setPaymentForm({
                    ...props.paymentForm,
                    reference: e.target.value,
                  })
                }
                placeholder="Referensi pembayaran"
                className="input"
              />
              <input
                required
                type="date"
                value={props.paymentForm.paidAt}
                onChange={(e) =>
                  props.setPaymentForm({
                    ...props.paymentForm,
                    paidAt: e.target.value,
                  })
                }
                className="input"
              />
              <input
                required
                value={props.paymentForm.reason}
                onChange={(e) =>
                  props.setPaymentForm({
                    ...props.paymentForm,
                    reason: e.target.value,
                  })
                }
                placeholder="Alasan/catatan"
                className="input"
              />
              <button
                className={`${button} border-success-border bg-success text-white hover:bg-success/90 sm:col-span-2`}
              >
                Catat Pembayaran
              </button>
            </form>
            <div className="mt-4 divide-y divide-border border-t border-border">
              {selected.payments.map((payment) => (
                <p
                  key={payment.id}
                  className="break-words py-2 text-caption tabular-nums text-muted [overflow-wrap:anywhere]"
                >
                  {date(payment.paidAt)} · {money(payment.amount)} ·{" "}
                  {payment.reference}
                </p>
              ))}
            </div>
          </Panel>
          <Panel title="Revisi Payroll" className="mt-3">
            <form
              onSubmit={props.onRevision}
              className="grid min-w-0 gap-2 sm:grid-cols-3"
            >
              <select
                required
                value={props.revisionForm.slipId}
                onChange={(e) =>
                  props.setRevisionForm({
                    ...props.revisionForm,
                    slipId: e.target.value,
                  })
                }
                className="input"
              >
                <option value="">Pilih slip</option>
                {selected.slips.map((slip) => (
                  <option key={slip.id} value={slip.id}>
                    {slip.employee.name}
                  </option>
                ))}
              </select>
              <select
                value={props.revisionForm.type}
                onChange={(e) =>
                  props.setRevisionForm({
                    ...props.revisionForm,
                    type: e.target.value,
                  })
                }
                className="input"
              >
                <option value="EARNING">Tambahan</option>
                <option value="DEDUCTION">Potongan</option>
              </select>
              <input
                required
                value={props.revisionForm.label}
                onChange={(e) =>
                  props.setRevisionForm({
                    ...props.revisionForm,
                    label: e.target.value,
                  })
                }
                placeholder="Komponen revisi"
                className="input"
              />
              <input
                required
                type="number"
                min="1"
                value={props.revisionForm.amount}
                onChange={(e) =>
                  props.setRevisionForm({
                    ...props.revisionForm,
                    amount: e.target.value,
                  })
                }
                placeholder="Nominal"
                className="input"
              />
              <input
                required
                value={props.revisionForm.reason}
                onChange={(e) =>
                  props.setRevisionForm({
                    ...props.revisionForm,
                    reason: e.target.value,
                  })
                }
                placeholder="Alasan revisi"
                className="input"
              />
              <input
                required
                value={props.revisionForm.itemReason}
                onChange={(e) =>
                  props.setRevisionForm({
                    ...props.revisionForm,
                    itemReason: e.target.value,
                  })
                }
                placeholder="Alasan item"
                className="input"
              />
              <button
                className={`${button} border-brand bg-brand text-white hover:bg-binder-deep sm:col-span-3`}
              >
                Buat Revisi
              </button>
            </form>
            {revisions.map((revision) => (
              <div
                key={revision.id}
                className="mt-3 flex min-w-0 flex-col gap-2 border-t border-border pt-3 text-caption sm:flex-row sm:flex-wrap sm:items-center"
              >
                <span className="min-w-0 break-words tabular-nums text-foreground [overflow-wrap:anywhere]">
                  Revisi #{revision.revisionNumber}:{" "}
                  {statusLabel[revision.status] ?? revision.status} ·{" "}
                  {money(revision.netAdjustment)}
                </span>
                {revision.status === "DRAFT" && (
                  <button
                    onClick={() =>
                      props.onAction(
                        `/payroll-admin/revisions/${revision.id}/submit`,
                        undefined,
                        "Ajukan revisi ini ke Direktur?",
                      )
                    }
                    className={`${button} border-border bg-paper text-brand hover:bg-surface-subtle`}
                  >
                    Ajukan Revisi
                  </button>
                )}
                {revision.status === "APPROVED" && (
                  <button
                    onClick={() =>
                      props.onAction(
                        `/payroll-admin/revisions/${revision.id}/finalize`,
                        undefined,
                        "Finalisasi revisi yang telah disetujui?",
                      )
                    }
                    className={`${button} border-success-border bg-success text-white hover:bg-success/90`}
                  >
                    Finalisasi Revisi
                  </button>
                )}
              </div>
            ))}
          </Panel>
        </>
      )}
    </>
  );
}

function RunList({
  runs,
  selected,
  onSelect,
}: {
  runs: Run[];
  selected?: string;
  onSelect: (run: Run) => void;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-paper">
      {runs.length === 0 && <Empty text="Belum ada payroll." />}
      {runs.map((run) => (
        <button
          key={run.id}
          onClick={() => onSelect(run)}
          className={`relative block min-h-14 w-full min-w-0 border-b border-border px-4 py-3 text-left text-body transition-colors before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:bg-transparent last:border-b-0 hover:bg-surface-subtle ${selected === run.id ? "bg-warning-surface before:bg-accent" : ""}`}
        >
          <p className="break-words font-semibold tabular-nums text-brand [overflow-wrap:anywhere]">
            {periodLabel(run)}
          </p>
          <p className="mt-1 text-caption text-muted">
            {statusLabel[run.status] ?? run.status} · {run._count.slips} slip
          </p>
        </button>
      ))}
    </div>
  );
}
function Panel({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`min-w-0 rounded-xl border border-border bg-paper p-3 ${className}`}
    >
      <h2 className="-mx-3 -mt-3 mb-3 break-words border-b border-border bg-surface-subtle px-3 py-2.5 text-section-title text-brand [overflow-wrap:anywhere]">
        {title}
      </h2>
      {children}
    </section>
  );
}
function Notice({ message }: { message: string }) {
  return (
    <Alert
      variant="danger"
      title="Payroll tidak dapat diproses"
      className="mb-4"
    >
      {message}
    </Alert>
  );
}
function Empty({ text }: { text: string }) {
  return <EmptyState title={text} />;
}
