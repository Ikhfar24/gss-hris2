'use client';

import { useEffect, useState, FormEvent } from 'react';
import { apiFetch, downloadFile, ApiError } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

interface RunListItem {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: 'DRAFT' | 'FINALIZED';
  _count: { slips: number };
}

interface LineItem {
  id: string;
  type: 'EARNING' | 'DEDUCTION';
  label: string;
  amount: number;
  note: string | null;
}

interface SlipRow {
  id: string;
  employee: { id: string; name: string };
  basis: 'CONTRACT' | 'DAILY_RATE';
  baseSalary: number;
  dailyRate: number | null;
  presentDays: number | null;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  items: LineItem[];
}

interface RunDetail extends RunListItem {
  slips: SlipRow[];
  skipped?: string[];
}

interface MySlip {
  id: string;
  netPay: number;
  baseSalary: number;
  payrollRun: { periodStart: string; periodEnd: string; status: string };
}

function formatRupiah(n: number) {
  return `Rp ${n.toLocaleString('id-ID')}`;
}

export default function PayrollPage() {
  const role = getUser()?.role;
  if (role === 'KARYAWAN') return <MySlipsView />;
  return <ManagementView role={role} />;
}

// -----------------------------------------------------------------------
// Karyawan: own finalized slips only
// -----------------------------------------------------------------------
function MySlipsView() {
  const [slips, setSlips] = useState<MySlip[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MySlip[]>('/payroll/my-slips', { token: getToken() })
      .then(setSlips)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Gagal memuat slip gaji'));
  }, []);

  async function download(slipId: string) {
    try {
      await downloadFile(`/payroll/slips/${slipId}/export`, getToken(), 'slip-gaji.pdf');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengunduh slip');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Slip Gaji Saya</h1>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {slips.length === 0 && <p className="text-sm text-slate-400">Belum ada slip gaji yang final.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {slips.map((s) => (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm text-slate-500">
              {new Date(s.payrollRun.periodStart).toLocaleDateString('id-ID')} – {new Date(s.payrollRun.periodEnd).toLocaleDateString('id-ID')}
            </div>
            <div className="mt-1 text-xl font-semibold">{formatRupiah(s.netPay)}</div>
            <button onClick={() => download(s.id)} className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-800">
              Download Slip (PDF)
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// HR/System Admin (full control) + Keuangan/Direktur (read-only, finalized only)
// -----------------------------------------------------------------------
function ManagementView({ role }: { role?: string }) {
  const isManager = role === 'ADMIN_HR' || role === 'SYSTEM_ADMIN';
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [selected, setSelected] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [period, setPeriod] = useState({ periodStart: '', periodEnd: '' });
  const [itemForms, setItemForms] = useState<Record<string, { type: string; label: string; amount: string; note: string }>>({});

  async function loadRuns() {
    try {
      const data = await apiFetch<RunListItem[]>('/payroll/runs', { token: getToken() });
      setRuns(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat daftar payroll');
    }
  }

  async function loadDetail(id: string) {
    try {
      const data = await apiFetch<RunDetail>(`/payroll/runs/${id}`, { token: getToken() });
      setSelected(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat detail payroll');
    }
  }

  useEffect(() => {
    loadRuns();
  }, []);

  async function onCreateRun(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const run = await apiFetch<RunDetail>('/payroll/runs', { method: 'POST', token: getToken(), body: period });
      setShowForm(false);
      setPeriod({ periodStart: '', periodEnd: '' });
      await loadRuns();
      setSelected(run);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuat periode payroll');
    } finally {
      setCreating(false);
    }
  }

  async function addItem(slipId: string) {
    const f = itemForms[slipId];
    if (!f || !f.label || !f.amount) return;
    setError(null);
    try {
      await apiFetch(`/payroll/slips/${slipId}/items`, {
        method: 'POST',
        token: getToken(),
        body: { type: f.type, label: f.label, amount: Number(f.amount), note: f.note || undefined },
      });
      setItemForms((s) => ({ ...s, [slipId]: { type: 'DEDUCTION', label: '', amount: '', note: '' } }));
      if (selected) await loadDetail(selected.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menambah item');
    }
  }

  async function removeItem(slipId: string, itemId: string) {
    setError(null);
    try {
      await apiFetch(`/payroll/slips/${slipId}/items/${itemId}`, { method: 'DELETE', token: getToken() });
      if (selected) await loadDetail(selected.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menghapus item');
    }
  }

  async function finalizeRun() {
    if (!selected) return;
    if (!confirm('Finalisasi payroll ini? Setelah final, tidak bisa diubah lagi.')) return;
    setError(null);
    try {
      await apiFetch(`/payroll/runs/${selected.id}/finalize`, { method: 'PATCH', token: getToken() });
      await loadDetail(selected.id);
      await loadRuns();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal finalisasi payroll');
    }
  }

  async function exportRun(format: 'xlsx' | 'pdf') {
    if (!selected) return;
    try {
      await downloadFile(`/payroll/runs/${selected.id}/export?format=${format}`, getToken(), `rekap-payroll.${format}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal export');
    }
  }

  async function downloadSlip(slipId: string) {
    try {
      await downloadFile(`/payroll/slips/${slipId}/export`, getToken(), 'slip-gaji.pdf');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengunduh slip');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Payroll</h1>
        {isManager && (
          <button onClick={() => setShowForm((s) => !s)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
            {showForm ? 'Batal' : '+ Buat Periode Baru'}
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={onCreateRun} className="mb-6 grid max-w-md gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <label className="text-sm">
            Mulai periode
            <input required type="date" value={period.periodStart} onChange={(e) => setPeriod({ ...period, periodStart: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            Selesai periode
            <input required type="date" value={period.periodEnd} onChange={(e) => setPeriod({ ...period, periodEnd: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <button type="submit" disabled={creating} className="rounded-lg bg-slate-900 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60 sm:col-span-2">
            {creating ? 'Membuat...' : 'Buat & Generate Slip'}
          </button>
        </form>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {runs.length === 0 && <p className="p-4 text-sm text-slate-400">Belum ada periode payroll.</p>}
          {runs.map((r) => (
            <button
              key={r.id}
              onClick={() => loadDetail(r.id)}
              className={`block w-full border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50 ${selected?.id === r.id ? 'bg-slate-50' : ''}`}
            >
              <div className="font-medium">
                {new Date(r.periodStart).toLocaleDateString('id-ID')} – {new Date(r.periodEnd).toLocaleDateString('id-ID')}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === 'FINALIZED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {r.status === 'FINALIZED' ? 'Final' : 'Draft'}
                </span>
                <span className="text-xs text-slate-400">{r._count.slips} slip</span>
              </div>
            </button>
          ))}
        </div>

        <div>
          {!selected && <p className="text-sm text-slate-400">Pilih periode payroll di sebelah kiri untuk melihat detail.</p>}
          {selected && (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">
                    {new Date(selected.periodStart).toLocaleDateString('id-ID')} – {new Date(selected.periodEnd).toLocaleDateString('id-ID')}
                  </h2>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${selected.status === 'FINALIZED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {selected.status === 'FINALIZED' ? 'Final' : 'Draft — masih bisa diubah'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => exportRun('xlsx')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">Excel</button>
                  <button onClick={() => exportRun('pdf')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">PDF</button>
                  {isManager && selected.status === 'DRAFT' && (
                    <button onClick={finalizeRun} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700">Finalisasi</button>
                  )}
                </div>
              </div>

              {selected.skipped && selected.skipped.length > 0 && (
                <p className="mb-3 rounded-lg bg-yellow-50 p-3 text-xs text-yellow-700">
                  Dilewati (belum ada kontrak/tarif harian): {selected.skipped.join(', ')}
                </p>
              )}

              <div className="space-y-3">
                {selected.slips.map((slip) => (
                  <div key={slip.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{slip.employee.name}</div>
                        <div className="text-xs text-slate-500">
                          {slip.basis === 'CONTRACT' ? 'Gaji Kontrak' : `Harian (${slip.presentDays ?? 0} hari × ${formatRupiah(slip.dailyRate ?? 0)})`}
                          {' · '}Pokok {formatRupiah(slip.baseSalary)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold">{formatRupiah(slip.netPay)}</div>
                        <button onClick={() => downloadSlip(slip.id)} className="text-xs text-slate-500 underline hover:text-slate-900">Download Slip</button>
                      </div>
                    </div>

                    {slip.items.length > 0 && (
                      <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs">
                        {slip.items.map((it) => (
                          <li key={it.id} className="flex items-center justify-between">
                            <span className={it.type === 'EARNING' ? 'text-green-600' : 'text-red-600'}>
                              {it.type === 'EARNING' ? '+ ' : '− '}{it.label}{it.note ? ` (${it.note})` : ''} — {formatRupiah(it.amount)}
                            </span>
                            {isManager && selected.status === 'DRAFT' && (
                              <button onClick={() => removeItem(slip.id, it.id)} className="text-slate-400 hover:text-red-600">Hapus</button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {isManager && selected.status === 'DRAFT' && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                        <select
                          value={itemForms[slip.id]?.type ?? 'DEDUCTION'}
                          onChange={(e) => setItemForms((s) => ({ ...s, [slip.id]: { ...(s[slip.id] ?? { label: '', amount: '', note: '' }), type: e.target.value } }))}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        >
                          <option value="DEDUCTION">Potongan</option>
                          <option value="EARNING">Tambahan (mis. lembur)</option>
                        </select>
                        <input
                          placeholder="Keterangan"
                          value={itemForms[slip.id]?.label ?? ''}
                          onChange={(e) => setItemForms((s) => ({ ...s, [slip.id]: { ...(s[slip.id] ?? { type: 'DEDUCTION', amount: '', note: '' }), label: e.target.value } }))}
                          className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        />
                        <input
                          type="number"
                          min={1}
                          placeholder="Nominal"
                          value={itemForms[slip.id]?.amount ?? ''}
                          onChange={(e) => setItemForms((s) => ({ ...s, [slip.id]: { ...(s[slip.id] ?? { type: 'DEDUCTION', label: '', note: '' }), amount: e.target.value } }))}
                          className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        />
                        <button onClick={() => addItem(slip.id)} className="rounded-lg bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-800">
                          Tambah
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
