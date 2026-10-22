"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState, FormEvent } from "react";
import { apiFetch, ApiError, downloadFile } from "@/lib/api";
import { useSession } from "@/components/providers/SessionProvider";
import { Clock3, MapPin, Search, UserRound } from "lucide-react";
import { EmployeeAvatar } from "@/components/employee/EmployeeAvatar";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime } from "@/lib/format";
import { XlsxImportPanel } from "@/components/XlsxImportPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ActionDialog } from "@/components/ui/action-dialog";
import {
  ActionMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert } from "@/components/ui/feedback";
import { DossierPage } from "@/components/ui/dossier";

interface LocationOption {
  id: string;
  referenceCode: string;
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
  employmentType: "TENAGA_BORONGAN" | "TENAGA_ARSIPARIS" | "STAFF_OFFICE";
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
  attendanceMode: "GEOFENCE" | "MOBILE";
  placements: { location: { name: string } }[];
  contracts?: ContractRow[];
  user?: { id: string; email: string; isActive: boolean } | null;
}
interface EmployeeResponse {
  data: EmployeeRow[];
  meta: { page: number; pageSize: number; total: number };
}
interface BulkResult {
  deactivated: number;
  failed: number;
  results: { employeeId: string; success: boolean; error?: string }[];
}
interface EmployeeEditForm {
  name: string;
  employeeNumber: string;
  nik: string;
  email: string;
  phone: string;
  address: string;
  jobTitle: string;
  attendanceMode: "GEOFENCE" | "MOBILE";
  reason: string;
}

const TYPE_LABEL: Record<string, string> = {
  TENAGA_BORONGAN: "Tenaga Borongan",
  TENAGA_ARSIPARIS: "Tenaga Arsiparis",
  STAFF_OFFICE: "Staff Kantor",
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  TRAINING: "bg-yellow-100 text-yellow-700",
  ON_LEAVE: "bg-blue-100 text-blue-700",
  RESIGNED: "bg-slate-200 text-slate-600",
  TERMINATED: "bg-red-100 text-red-700",
};

function formatRupiah(n: number | null) {
  if (n === null || n === undefined) return "-";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export default function EmployeesPage() {
  const searchParams = useSearchParams();
  const { session } = useSession();
  const role = session.role;
  const canManage = ["ADMIN_HR", "SYSTEM_ADMIN"].includes(role);
  const isCoordinator = role === "KOORDINATOR";
  const isAdminHr = role === "ADMIN_HR";
  const redesignedList = isCoordinator || isAdminHr;
  const scopeTypes = session.coordinatorScopeTypes;
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const requestedType = searchParams.get("employmentType");
  const initialTypeFilter =
    requestedType === "TENAGA_BORONGAN" ||
    requestedType === "TENAGA_ARSIPARIS" ||
    requestedType === "STAFF_OFFICE"
      ? !isCoordinator || scopeTypes.includes(requestedType)
        ? requestedType
        : ""
      : isCoordinator && scopeTypes.length === 1
        ? scopeTypes[0]
        : "";
  const [typeFilter, setTypeFilter] = useState(initialTypeFilter);
  const [todayAttendance, setTodayAttendance] = useState<
    Record<
      string,
      {
        checkInAt: string | null;
        checkOutAt: string | null;
        latenessStatus: string;
      }
    >
  >({});
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState("");
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
  const [forceDeleteTarget, setForceDeleteTarget] = useState<EmployeeRow | null>(null);
  const [forceDeleteReason, setForceDeleteReason] = useState("");
  const [forceDeleteConfirmation, setForceDeleteConfirmation] = useState("");
  const [forceDeleting, setForceDeleting] = useState(false);
  const [lifecycleTarget, setLifecycleTarget] = useState<{ employee: EmployeeRow; action: "deactivate" | "reactivate" | "delete" } | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [contracts, setContracts] = useState<Record<string, ContractRow[]>>({});
  const [contractForm, setContractForm] = useState({
    type: "PKWT",
    startDate: "",
    endDate: "",
    baseSalary: "",
  });
  const requestId = useRef(0);
  const [form, setForm] = useState({
    name: "",
    nik: "",
    employeeNumber: "",
    phone: "",
    address: "",
    jobTitle: "",
    employmentType: "TENAGA_BORONGAN",
    joinDate: "",
    initialLocationId: "",
    dailyRate: "",
  });

  async function load(requestedPage = page) {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(requestedPage),
        pageSize: "25",
      });
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("employmentType", typeFilter);
      const [emps, locs, attendanceRows] = await Promise.all([
        apiFetch<EmployeeResponse>(`/employees?${params}`),
        canManage
          ? apiFetch<LocationOption[]>("/locations")
          : Promise.resolve([]),
        redesignedList
          ? apiFetch<{
              people: {
                employee: { id: string };
                attendance: {
                  checkInAt: string | null;
                  checkOutAt: string | null;
                  latenessStatus: string;
                } | null;
              }[];
            }>("/attendance/monitoring").then((result) =>
              result.people
                .filter((person) => person.attendance)
                .map((person) => ({
                  employee: person.employee,
                  ...person.attendance!,
                })),
            )
          : Promise.resolve([]),
      ]);
      if (currentRequest !== requestId.current) return;
      setEmployees(emps.data);
      setTotal(emps.meta.total);
      setPage(emps.meta.page);
      setSelectedIds([]);
      setLocations(locs);
      setTodayAttendance(
        Object.fromEntries(
          attendanceRows.map((attendance) => [
            attendance.employee.id,
            attendance,
          ]),
        ),
      );
    } catch (err) {
      if (currentRequest === requestId.current)
        setError(
          err instanceof ApiError ? err.message : "Gagal memuat data karyawan",
        );
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  const isInitialMount = useRef(true);
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      load(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter, typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    load(1);
  }

  async function deactivateSelected() {
    if (!bulkReason.trim() || selectedIds.length === 0) return;
    setError(null);
    try {
      const result = await apiFetch<BulkResult>("/employees/bulk-deactivate", {
        method: "PATCH",
        body: { employeeIds: selectedIds, reason: bulkReason.trim() },
      });
      setBulkResult(result);
      setBulkReason("");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Gagal menonaktifkan karyawan terpilih",
      );
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/employees", {
        method: "POST",
        body: {
          ...form,
          nik: form.nik || undefined,
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
      setError(
        err instanceof ApiError ? err.message : "Gagal membuat data karyawan",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function editEmployee(employee: EmployeeRow) {
    setEditing(employee);
    setEditForm({
      name: employee.name,
      employeeNumber: employee.employeeNumber ?? "",
      nik: employee.nik ?? "",
      email: employee.email ?? "",
      phone: employee.phone ?? "",
      address: employee.address ?? "",
      jobTitle: employee.jobTitle ?? "",
      attendanceMode: employee.attendanceMode,
      reason: "",
    });
    setError(null);
    setSuccess(null);
  }

  async function saveEmployeeEdit(e: FormEvent) {
    e.preventDefault();
    if (
      !editing ||
      !editForm ||
      !editForm.name.trim() ||
      !editForm.reason.trim()
    ) {
      setError("Nama dan alasan perubahan wajib diisi");
      return;
    }
    setSavingEdit(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/employees/${editing.id}`, {
        method: "PATCH",
        body: {
          name: editForm.name.trim(),
          employeeNumber: editForm.employeeNumber.trim() || undefined,
          nik: editForm.nik.trim() || undefined,
          phone: editForm.phone.trim() || undefined,
          address: editForm.address.trim() || undefined,
          email: editForm.email.trim() || undefined,
          jobTitle: editForm.jobTitle.trim() || undefined,
          ...(role === "ADMIN_HR"
            ? { attendanceMode: editForm.attendanceMode }
            : {}),
          reason: editForm.reason.trim(),
        },
      });
      setEditing(null);
      setEditForm(null);
      setSuccess("Data master karyawan berhasil diperbarui.");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Gagal memperbarui karyawan",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function lifecycle(reason: string) {
    if (!lifecycleTarget) return;
    const { employee, action } = lifecycleTarget;
    setLifecycleBusy(true);
    try {
      await apiFetch(
        `/employees/${employee.id}${action === "delete" ? "" : `/${action}`}`,
        { method: action === "delete" ? "DELETE" : "PATCH", body: { reason } },
      );
      setLifecycleTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Aksi lifecycle gagal");
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function forceDeleteEmployee() {
    if (!forceDeleteTarget) return;
    setForceDeleting(true);
    setError(null);
    try {
      await apiFetch(`/employees/${forceDeleteTarget.id}/force-delete`, {
        method: "POST",
        body: { reason: forceDeleteReason, confirmation: forceDeleteConfirmation },
      });
      setForceDeleteTarget(null);
      setForceDeleteReason("");
      setForceDeleteConfirmation("");
      setSuccess("Karyawan berhasil dihapus paksa dengan riwayat penting tetap dipertahankan.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Force Delete gagal");
    } finally {
      setForceDeleting(false);
    }
  }

  function closeForceDelete() {
    if (forceDeleting) return;
    setForceDeleteTarget(null);
    setForceDeleteReason("");
    setForceDeleteConfirmation("");
  }

  async function toggleContracts(employeeId: string) {
    if (expandedId === employeeId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(employeeId);
    if (!contracts[employeeId]) {
      try {
        const data = await apiFetch<ContractRow[]>(
          `/contracts/employee/${employeeId}`,
        );
        setContracts((c) => ({ ...c, [employeeId]: data }));
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Gagal memuat kontrak",
        );
      }
    }
  }

  async function onAddContract(employeeId: string, e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/contracts", {
        method: "POST",
        body: {
          employeeId,
          type: contractForm.type,
          startDate: contractForm.startDate,
          endDate: contractForm.endDate || undefined,
          baseSalary: contractForm.baseSalary
            ? Number(contractForm.baseSalary)
            : undefined,
        },
      });
      setContractForm({
        type: "PKWT",
        startDate: "",
        endDate: "",
        baseSalary: "",
      });
      const data = await apiFetch<ContractRow[]>(
        `/contracts/employee/${employeeId}`,
      );
      setContracts((c) => ({ ...c, [employeeId]: data }));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Gagal menambah kontrak",
      );
    }
  }

  return (
    <DossierPage>
      <header className="mb-3 flex flex-col justify-between gap-3 border-b border-border pb-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-caption font-semibold text-muted">
            {isCoordinator ? "TIM" : isAdminHr ? "WORKFORCE" : "TENAGA KERJA"}
          </p>
          <h1 className="mt-1 text-page-title text-brand">
            {isCoordinator
              ? `Tim Saya${scopeTypes.length === 1 ? ` — ${TYPE_LABEL[scopeTypes[0]].replace("Tenaga ", "")}` : ""}`
              : "Data Karyawan"}
          </h1>
          {redesignedList && (
            <p className="mt-0.5 text-body text-muted">
              {isCoordinator
                ? "Daftar ini selalu dibatasi oleh CoordinatorScope aktif Anda."
                : "Cari dan buka Profil Lengkap untuk administrasi karyawan."}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <>
              <div className="hidden gap-2 sm:flex">
                <button
                  onClick={() =>
                    downloadFile(
                      "/employees/export?format=xlsx",
                      null,
                      "daftar-karyawan.xlsx",
                    ).catch((err) =>
                      setError(
                        err instanceof ApiError
                          ? err.message
                          : "Gagal mengekspor data",
                      ),
                    )
                  }
                  className="rounded-lg border border-border bg-paper px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-subtle"
                >
                  Ekspor Excel
                </button>
                <button
                  onClick={() =>
                    downloadFile(
                      "/employees/export?format=pdf",
                      null,
                      "daftar-karyawan.pdf",
                    ).catch((err) =>
                      setError(
                        err instanceof ApiError
                          ? err.message
                          : "Gagal mengekspor data",
                      ),
                    )
                  }
                  className="rounded-lg border border-border bg-paper px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-subtle"
                >
                  Ekspor PDF
                </button>
              </div>
              <details className="relative sm:hidden">
                <summary className="min-h-10 cursor-pointer list-none rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  Ekspor
                </summary>
                <div className="absolute right-0 z-10 mt-2 grid min-w-40 gap-1 rounded-xl border bg-white p-2 shadow-lg">
                  <button
                    onClick={() =>
                      downloadFile(
                        "/employees/export?format=xlsx",
                        null,
                        "daftar-karyawan.xlsx",
                      ).catch((err) =>
                        setError(
                          err instanceof ApiError
                            ? err.message
                            : "Gagal mengekspor data",
                        ),
                      )
                    }
                    className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    Excel
                  </button>
                  <button
                    onClick={() =>
                      downloadFile(
                        "/employees/export?format=pdf",
                        null,
                        "daftar-karyawan.pdf",
                      ).catch((err) =>
                        setError(
                          err instanceof ApiError
                            ? err.message
                            : "Gagal mengekspor data",
                        ),
                      )
                    }
                    className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    PDF
                  </button>
                </div>
              </details>
            </>
          )}
          {canManage && (
            <button
              onClick={() => setShowForm((s) => !s)}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              {showForm ? "Batal" : "+ Tambah Karyawan"}
            </button>
          )}
        </div>
      </header>

      {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
      {success && <Alert variant="success" className="mb-4">{success}</Alert>}

      <Dialog open={!!editing && !!editForm} onOpenChange={(open) => { if (!open && !savingEdit) { setEditing(null); setEditForm(null); setError(null); } }}>
        {editing && editForm && (
        <DialogContent showClose={!savingEdit} className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] max-w-xl">
          <DialogTitle>Edit Data Karyawan</DialogTitle>
          <DialogDescription>Perubahan data master memerlukan alasan dan dicatat dalam audit.</DialogDescription>
          <form
            onSubmit={saveEmployeeEdit}
            aria-busy={savingEdit}
            className="mt-5"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <EditField
                label="Nama"
                required
                value={editForm.name}
                onChange={(value) => setEditForm({ ...editForm, name: value })}
              />
              <EditField
                label="NIP (nomor karyawan internal)"
                value={editForm.employeeNumber}
                onChange={(value) =>
                  setEditForm({ ...editForm, employeeNumber: value })
                }
              />
              <EditField
                label="NIK (16 digit kependudukan)"
                value={editForm.nik}
                onChange={(value) => setEditForm({ ...editForm, nik: value })}
              />
              <EditField
                label="Email"
                type="email"
                value={editForm.email}
                onChange={(value) => setEditForm({ ...editForm, email: value })}
              />
              <EditField
                label="Telepon"
                value={editForm.phone}
                onChange={(value) => setEditForm({ ...editForm, phone: value })}
              />
              <EditField
                label="Jabatan"
                value={editForm.jobTitle}
                onChange={(value) =>
                  setEditForm({ ...editForm, jobTitle: value })
                }
              />
              {role === "ADMIN_HR" && (
                <label className="text-sm">
                  Mode absensi
                  <select
                    value={editForm.attendanceMode}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        attendanceMode: e.target
                          .value as EmployeeEditForm["attendanceMode"],
                      })
                    }
                    className="input mt-1"
                  >
                    <option value="GEOFENCE">Geofence</option>
                    <option value="MOBILE">Mobile</option>
                  </select>
                </label>
              )}
              <label className="text-sm sm:col-span-2">
                Alamat
                <textarea
                  rows={3}
                  value={editForm.address}
                  onChange={(e) =>
                    setEditForm({ ...editForm, address: e.target.value })
                  }
                  className="input mt-1"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Alasan perubahan
                <input
                  required
                  value={editForm.reason}
                  onChange={(e) =>
                    setEditForm({ ...editForm, reason: e.target.value })
                  }
                  className="input mt-1"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
               <Button
                 type="button"
                 variant="secondary"
                 disabled={savingEdit}
                onClick={() => {
                  setEditing(null);
                  setEditForm(null);
                  setError(null);
                }}
               >
                 Batal
               </Button>
               <Button
                 disabled={savingEdit}
               >
                 {savingEdit ? "Menyimpan..." : "Simpan Perubahan"}
               </Button>
            </div>
          </form>
        </DialogContent>
      )}
      </Dialog>

      {showForm && (
        <form
          onSubmit={onCreate}
          className="mb-4 grid max-w-2xl gap-2 rounded-xl border border-border bg-paper p-3 sm:grid-cols-2"
        >
          <input
            required
            placeholder="Nama lengkap"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="NIP / nomor karyawan internal"
            value={form.employeeNumber}
            onChange={(e) =>
              setForm({ ...form, employeeNumber: e.target.value })
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            inputMode="numeric"
            placeholder="NIK / 16 digit nomor kependudukan"
            value={form.nik}
            onChange={(e) => setForm({ ...form, nik: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500 sm:col-span-2">NIK dan NIP adalah identitas berbeda. Gunakan format teks agar nol di depan tidak hilang.</p>
          <input
            placeholder="Nomor telepon/WhatsApp"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Alamat"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Jabatan"
            value={form.jobTitle}
            onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={form.employmentType}
            onChange={(e) =>
              setForm({ ...form, employmentType: e.target.value })
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="TENAGA_BORONGAN">Tenaga Borongan</option>
            <option value="TENAGA_ARSIPARIS">Tenaga Arsiparis</option>
            <option value="STAFF_OFFICE">Staff Kantor</option>
          </select>
          <label className="text-sm">
            Tanggal bergabung
            <input
              required
              type="date"
              value={form.joinDate}
              onChange={(e) => setForm({ ...form, joinDate: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <select
            value={form.initialLocationId}
            onChange={(e) =>
              setForm({ ...form, initialLocationId: e.target.value })
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">-- Penempatan awal (opsional) --</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.referenceCode} - {l.name}
              </option>
            ))}
          </select>
          <label className="text-sm">
            Tarif Harian Lepas (opsional — isi kalau belum ada kontrak/masih
            training)
            <input
              type="number"
              min={0}
              placeholder="cth. 95000"
              value={form.dailyRate}
              onChange={(e) => setForm({ ...form, dailyRate: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-slate-900 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60 sm:col-span-2"
          >
            {submitting ? "Menyimpan..." : "Simpan Karyawan"}
          </button>
        </form>
      )}

      <form
        onSubmit={applyFilters}
        className="mb-3 grid gap-2 border-y border-border bg-paper py-2 sm:grid-cols-2 lg:grid-cols-[minmax(18rem,1fr)_10rem_11rem_auto] lg:items-center"
      >
        <label className="relative flex-1">
          <span className="sr-only">Cari karyawan</span>
          <Search className="absolute left-3 top-3.5 size-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, NIP, atau jabatan"
            className="input min-h-11 w-full pl-9 lg:min-h-10"
          />
        </label>
        <select
          aria-label="Filter status karyawan"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input min-h-11 lg:min-h-10 lg:w-full"
        >
          <option value="">Semua status</option>
          {Object.keys(STATUS_STYLE)
            .concat("INACTIVE")
            .map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
        </select>
        {(!isCoordinator || scopeTypes.length > 1) && (
          <select
            aria-label="Filter jenis tenaga"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input min-h-11 lg:min-h-10 lg:w-full"
          >
            <option value="">Semua jenis</option>
            {(!isCoordinator || scopeTypes.includes("TENAGA_BORONGAN")) && (
              <option value="TENAGA_BORONGAN">Tenaga Borongan</option>
            )}
            {(!isCoordinator || scopeTypes.includes("TENAGA_ARSIPARIS")) && (
              <option value="TENAGA_ARSIPARIS">Tenaga Arsiparis</option>
            )}
            {(!isCoordinator || scopeTypes.includes("STAFF_OFFICE")) && (
              <option value="STAFF_OFFICE">Staff Kantor</option>
            )}
          </select>
        )}
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover lg:min-h-10"
        >
          Terapkan
        </button>
      </form>

      {canManage && (
        <details className="mb-3 rounded-xl border border-border bg-paper px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-brand">
            Impor karyawan dari Excel
          </summary>
          <div className="mt-3 border-t border-border pt-3">
            <XlsxImportPanel
              resource="employees"
              title="Impor Karyawan dari Excel"
              onCommitted={() => load(1)}
            />
          </div>
        </details>
      )}

      {canManage && selectedIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-warning-border bg-warning-surface p-3 text-sm">
          <span>{selectedIds.length} karyawan dipilih</span>
          <input
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            placeholder="Alasan nonaktifkan (min. 3 karakter)"
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
          <button
            onClick={deactivateSelected}
            disabled={bulkReason.trim().length < 3}
            className="rounded-lg bg-red-700 px-3 py-2 text-white disabled:opacity-50"
          >
            Nonaktifkan Terpilih
          </button>
        </div>
      )}
      {bulkResult && (
        <p className="mb-4 text-sm">
          Nonaktif massal: {bulkResult.deactivated} berhasil,{" "}
          {bulkResult.failed} gagal.
          {bulkResult.results
            .filter((item) => !item.success)
            .map((item) => ` ${item.error}`)
            .join("")}
        </p>
      )}

      {loading ? (
        <div className="grid gap-3 md:hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:hidden">
            {employees.map((employee) => {
              const attendance = todayAttendance[employee.id];
              return (
                <article
                  key={employee.id}
                  className="overflow-hidden rounded-xl bg-paper p-4 shadow-card border border-border"
                >
                  <div className="flex items-start gap-3">
                    {canManage && (
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${employee.name}`}
                        checked={selectedIds.includes(employee.id)}
                        onChange={(event) =>
                          setSelectedIds((ids) =>
                            event.target.checked
                              ? [...ids, employee.id]
                              : ids.filter((id) => id !== employee.id),
                          )
                        }
                        className="mt-3 size-4 shrink-0 accent-brand"
                      />
                    )}
                    <EmployeeAvatar
                      name={employee.name}
                      photoUrl={employee.photoUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words font-bold leading-6 text-brand [overflow-wrap:anywhere]">
                          {employee.name}
                        </h2>
                        <StatusBadge status={employee.status} className="self-center" />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {employee.employeeNumber ?? "NIP belum tersedia"} ·{" "}
                        {TYPE_LABEL[employee.employmentType]}
                      </p>
                      <p className="mt-1 break-words text-caption text-muted [overflow-wrap:anywhere]">
                        <MapPin className="mr-1 inline size-3.5" />
                        {employee.placements[0]?.location?.name ??
                          "Belum ditempatkan"}
                      </p>
                      {isCoordinator && (
                        <p className="mt-2 text-xs font-medium text-slate-600">
                          <Clock3 className="mr-1 inline size-3.5" />
                          {attendance?.checkInAt
                            ? `${formatTime(attendance.checkInAt)} · ${attendance.latenessStatus === "LATE" ? "Terlambat" : "Hadir"}`
                            : "Belum absen hari ini"}
                        </p>
                      )}
                    </div>
                  </div>
                    <div className={`mt-5 grid gap-2 border-t border-border pt-4 ${isCoordinator ? "grid-cols-2" : "grid-cols-1"}`}>
                    <Link
                      href={`/employees/${employee.id}/360`}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-3 text-sm font-semibold text-white"
                    >
                      <UserRound className="mr-2 size-4" />
                      Profil Lengkap
                    </Link>
                     {isCoordinator && (
                      <Link
                        href={`/attendance?employeeId=${employee.id}`}
                        className="inline-flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm font-semibold text-slate-600"
                      >
                        Absensi
                      </Link>
                     )}
                     {canManage && (
                       <>
                         <button
                           type="button"
                           onClick={() => toggleContracts(employee.id)}
                           className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold text-foreground"
                         >
                           {expandedId === employee.id ? "Tutup" : "Kelola Kontrak"}
                         </button>
                         <button
                           type="button"
                           onClick={() => editEmployee(employee)}
                           className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold text-foreground"
                         >
                           Edit
                         </button>
                         <button
                           type="button"
                           onClick={() =>
                             setLifecycleTarget({
                               employee,
                               action:
                                 employee.status === "INACTIVE"
                                   ? "reactivate"
                                   : "deactivate",
                             })
                           }
                           className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold text-foreground"
                         >
                           {employee.status === "INACTIVE"
                             ? "Aktifkan"
                             : "Nonaktifkan"}
                         </button>
                         {!employee.user && (
                           <Link
                             href={`/users?employeeId=${encodeURIComponent(employee.id)}`}
                             className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold text-foreground"
                           >
                             Buat Akun Login
                           </Link>
                         )}
                         <button
                           type="button"
                           onClick={() => setForceDeleteTarget(employee)}
                           className="min-h-11 rounded-lg border border-danger-border px-3 text-sm font-semibold text-danger"
                         >
                           Hapus Paksa
                         </button>
                       </>
                     )}
                   </div>
                   {canManage && expandedId === employee.id && (
                     <div className="mt-4 border-t border-border pt-4">
                       <p className="text-caption font-semibold text-muted">
                         RIWAYAT KONTRAK
                       </p>
                       {(contracts[employee.id] ?? []).length ? (
                         <ul className="mt-2 divide-y divide-border text-sm">
                           {(contracts[employee.id] ?? []).map((contract) => (
                             <li key={contract.id} className="py-2 text-foreground">
                               <span className="font-semibold">{contract.type}</span>{" "}
                               · {new Date(contract.startDate).toLocaleDateString("id-ID")}
                               {contract.endDate
                                 ? ` - ${new Date(contract.endDate).toLocaleDateString("id-ID")}`
                                 : " (tanpa batas)"}
                               {" "}· {formatRupiah(contract.baseSalary)}/bulan
                             </li>
                           ))}
                         </ul>
                       ) : (
                         <p className="mt-2 text-sm text-muted">Belum ada kontrak.</p>
                       )}
                       <form
                         onSubmit={(event) => onAddContract(employee.id, event)}
                         className="mt-3 grid gap-2"
                       >
                         <select value={contractForm.type} onChange={(event) => setContractForm({ ...contractForm, type: event.target.value })} className="input">
                           <option value="PKWT">PKWT</option>
                           <option value="PKWTT">PKWTT</option>
                           <option value="OTHER">Lainnya</option>
                         </select>
                         <input type="number" min={0} required placeholder="Gaji pokok/bulan" value={contractForm.baseSalary} onChange={(event) => setContractForm({ ...contractForm, baseSalary: event.target.value })} className="input" />
                         <input type="date" required value={contractForm.startDate} onChange={(event) => setContractForm({ ...contractForm, startDate: event.target.value })} className="input" />
                         <input type="date" value={contractForm.endDate} onChange={(event) => setContractForm({ ...contractForm, endDate: event.target.value })} className="input" />
                         <Button type="submit">+ Tambah Kontrak</Button>
                       </form>
                     </div>
                   )}
                 </article>
              );
            })}
            {employees.length === 0 && (
              <EmptyState
                title={
                  isCoordinator
                    ? "Tidak ada anggota dalam scope aktif"
                    : "Karyawan tidak ditemukan"
                }
                description="Ubah pencarian atau filter untuk melihat hasil lain."
              />
            )}
          </div>
      )}
      <div
         className="hidden overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-paper md:block"
      >
        <table className="w-full min-w-[980px] text-sm">
           <thead className="bg-surface-subtle text-left text-caption font-semibold text-muted">
            <tr>
              {canManage && (
                 <th scope="col" className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua"
                    checked={
                      employees.length > 0 &&
                      selectedIds.length === employees.length
                    }
                    onChange={(e) =>
                      setSelectedIds(
                        e.target.checked ? employees.map((emp) => emp.id) : [],
                      )
                    }
                  />
                </th>
              )}
               <th scope="col" className="px-3 py-2.5">Nama</th>
               <th scope="col" className="px-3 py-2.5">Jenis</th>
               <th scope="col" className="px-3 py-2.5">Status</th>
               <th scope="col" className="px-3 py-2.5">Lokasi Kerja</th>
               {canManage && <th scope="col" className="px-3 py-2.5">Tarif Harian</th>}
               <th scope="col" className="px-3 py-2.5"><span className="sr-only">Tindakan</span></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <Fragment key={emp.id}>
                  <tr className="border-b border-border transition-colors hover:bg-surface-subtle/70">
                  {canManage && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${emp.name}`}
                        checked={selectedIds.includes(emp.id)}
                        onChange={(e) =>
                          setSelectedIds((ids) =>
                            e.target.checked
                              ? [...ids, emp.id]
                              : ids.filter((id) => id !== emp.id),
                          )
                        }
                      />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <EmployeeAvatar name={emp.name} photoUrl={emp.photoUrl} size="sm" className="size-9" />
                      <div className="min-w-0">
                        <p className="font-semibold text-navy">{emp.name}</p>
                        <p className="text-xs text-slate-500">{emp.employeeNumber ?? "NIP belum tersedia"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {TYPE_LABEL[emp.employmentType]}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={emp.status} />
                  </td>
                  <td className="px-3 py-2">
                    {emp.placements[0]?.location?.name ?? "-"}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2">{formatRupiah(emp.dailyRate)}</td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Link
                      href={`/employees/${emp.id}/360`}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border bg-paper px-2.5 text-xs font-semibold text-brand shadow-control transition-colors hover:border-brand/40 hover:bg-surface-subtle"
                    >
                      <UserRound className="size-3.5 text-muted" />
                      Profil Lengkap
                    </Link>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <span className="ml-2 inline-flex"><ActionMenuTrigger label={`Tindakan lain untuk ${emp.name}`} /></span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => toggleContracts(emp.id)}>{expandedId === emp.id ? "Tutup Kontrak" : "Kelola Kontrak"}</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => editEmployee(emp)}>Edit Karyawan</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setLifecycleTarget({ employee: emp, action: emp.status === "INACTIVE" ? "reactivate" : "deactivate" })}>{emp.status === "INACTIVE" ? "Aktifkan" : "Nonaktifkan"}</DropdownMenuItem>
                          {!emp.user && <DropdownMenuItem asChild><Link href={`/users?employeeId=${encodeURIComponent(emp.id)}`}>Buat Akun Login</Link></DropdownMenuItem>}
                          <DropdownMenuSeparator className="my-1 h-px bg-border" />
                          <DropdownMenuItem danger onSelect={() => setForceDeleteTarget(emp)}>Hapus Paksa</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
                {expandedId === emp.id && (
                  <tr className="border-t border-slate-100 bg-slate-50">
                    <td colSpan={canManage ? 7 : 6} className="px-4 py-4">
                      <div className="mb-3">
                        <h4 className="mb-2 text-xs font-semibold text-slate-500">
                          RIWAYAT KONTRAK
                        </h4>
                        {(contracts[emp.id] ?? []).length === 0 && (
                          <p className="text-xs text-slate-400">
                            Belum ada kontrak.
                          </p>
                        )}
                        <ul className="space-y-1">
                          {(contracts[emp.id] ?? []).map((c) => (
                            <li key={c.id} className="text-xs text-slate-700">
                              {c.type} ·{" "}
                              {new Date(c.startDate).toLocaleDateString(
                                "id-ID",
                              )}
                              {c.endDate
                                ? ` – ${new Date(c.endDate).toLocaleDateString("id-ID")}`
                                : " (tanpa batas)"}{" "}
                              ·{" "}
                              <span
                                className={
                                  c.status === "ACTIVE"
                                    ? "text-green-600"
                                    : "text-slate-400"
                                }
                              >
                                {c.status}
                              </span>{" "}
                              · {formatRupiah(c.baseSalary)}/bulan
                            </li>
                          ))}
                        </ul>
                      </div>
                      <form
                        onSubmit={(e) => onAddContract(emp.id, e)}
                        className="grid max-w-md gap-2 sm:grid-cols-2"
                      >
                        <select
                          value={contractForm.type}
                          onChange={(e) =>
                            setContractForm({
                              ...contractForm,
                              type: e.target.value,
                            })
                          }
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                        >
                          <option value="PKWT">PKWT</option>
                          <option value="PKWTT">PKWTT</option>
                          <option value="OTHER">Lainnya</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          required
                          placeholder="Gaji pokok/bulan"
                          value={contractForm.baseSalary}
                          onChange={(e) =>
                            setContractForm({
                              ...contractForm,
                              baseSalary: e.target.value,
                            })
                          }
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                        />
                        <input
                          type="date"
                          required
                          value={contractForm.startDate}
                          onChange={(e) =>
                            setContractForm({
                              ...contractForm,
                              startDate: e.target.value,
                            })
                          }
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                        />
                        <input
                          type="date"
                          placeholder="Selesai (opsional)"
                          value={contractForm.endDate}
                          onChange={(e) =>
                            setContractForm({
                              ...contractForm,
                              endDate: e.target.value,
                            })
                          }
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-800 sm:col-span-2"
                        >
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
      <div className="mt-4 flex items-center justify-between text-sm">
        <span>Total {total} karyawan</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(page - 1)}
            disabled={page <= 1}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Sebelumnya
          </button>
          <span>
            Halaman {page} / {Math.max(1, Math.ceil(total / 25))}
          </span>
          <button
            onClick={() => load(page + 1)}
            disabled={page >= Math.ceil(total / 25)}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Berikutnya
          </button>
        </div>
      </div>
      <Dialog open={!!forceDeleteTarget} onOpenChange={(open) => { if (!open) closeForceDelete(); }}>
        <DialogContent showClose={!forceDeleting} aria-busy={forceDeleting} onEscapeKeyDown={(event) => { if (forceDeleting) event.preventDefault(); }} onPointerDownOutside={(event) => { if (forceDeleting) event.preventDefault(); }}>
          <DialogTitle>Force Delete Employee</DialogTitle>
          <DialogDescription>Tindakan ini menghapus karyawan dari pengelolaan aktif, menonaktifkan akun login, dan menganonimkan identitas. Riwayat payroll, presensi, persetujuan, dan audit tetap dipertahankan.</DialogDescription>
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="font-bold text-red-900">{forceDeleteTarget?.name}</p>
            <p className="mt-1 text-sm text-red-800">NIP: {forceDeleteTarget?.employeeNumber ?? "Tidak tersedia"}</p>
            <p className="mt-3 text-sm font-semibold text-red-900">Ini adalah Force Delete dan tidak dapat dibatalkan dari aplikasi.</p>
          </div>
          <label className="mt-4 block text-sm font-semibold text-slate-700">Alasan wajib<textarea value={forceDeleteReason} onChange={(event) => setForceDeleteReason(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal" /></label>
          <label className="mt-4 block text-sm font-semibold text-slate-700">Ketik HAPUS untuk konfirmasi<input value={forceDeleteConfirmation} onChange={(event) => setForceDeleteConfirmation(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal" /></label>
          <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" disabled={forceDeleting} onClick={closeForceDelete}>Batal</Button><Button type="button" variant="danger" disabled={forceDeleting || forceDeleteReason.trim().length < 3 || forceDeleteConfirmation !== "HAPUS"} onClick={forceDeleteEmployee}>{forceDeleting ? "Menghapus..." : "Hapus Paksa"}</Button></div>
        </DialogContent>
      </Dialog>
      <ActionDialog open={!!lifecycleTarget} title={lifecycleTarget?.action === "reactivate" ? "Aktifkan Karyawan" : lifecycleTarget?.action === "delete" ? "Hapus Aman Karyawan" : "Nonaktifkan Karyawan"} description={lifecycleTarget?.action === "delete" ? "Penghapusan akan ditolak jika karyawan memiliki riwayat terlindungi." : "Status karyawan akan diperbarui melalui lifecycle guard backend."} reasonLabel="Alasan tindakan" reasonRequired confirmLabel={lifecycleTarget?.action === "reactivate" ? "Aktifkan" : lifecycleTarget?.action === "delete" ? "Hapus" : "Nonaktifkan"} danger={lifecycleTarget?.action !== "reactivate"} busy={lifecycleBusy} onClose={() => setLifecycleTarget(null)} onConfirm={lifecycle} />
    </DossierPage>
  );
}

function EditField({
  label,
  value,
  onChange,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="text-sm">
      {label}
      <input
        required={required}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input mt-1"
      />
    </label>
  );
}
