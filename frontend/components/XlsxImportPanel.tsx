'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { ApiError, downloadFile, uploadFile } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface ImportRowError {
  row: number;
  errors?: string[];
  messages?: string[];
  message?: string;
}

interface ImportPreviewResponse {
  valid?: boolean;
  totalRows?: number;
  rowCount?: number;
  validCount?: number;
  validRows?: number | unknown[];
  invalidCount?: number;
  invalidRows?: number | unknown[];
  rows?: unknown[];
  errors?: ImportRowError[];
}

interface TemporaryCredential {
  name?: string;
  employeeName?: string;
  username?: string;
  email?: string;
  temporaryPassword?: string;
  password?: string;
}

interface ImportCommitResponse {
  createdCount?: number;
  created?: number;
  importedCount?: number;
  temporaryCredentials?: TemporaryCredential[];
  generatedCredentials?: TemporaryCredential[];
  credentials?: TemporaryCredential[];
}

interface XlsxImportPanelProps {
  resource: 'clients' | 'locations' | 'employees';
  title: string;
  onCommitted: () => void | Promise<void>;
}

function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  const message: unknown = error.message;
  if (Array.isArray(message)) return message.map(String).join(', ');
  return typeof message === 'string' && message.trim() ? message : fallback;
}

function messagesFor(error: ImportRowError) {
  const messages = error.errors ?? error.messages ?? (error.message ? [error.message] : []);
  return messages.length ? messages : ['Data pada baris ini tidak valid'];
}

function countValue(value: number | unknown[] | undefined): number | undefined {
  if (Array.isArray(value)) return value.length;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function XlsxImportPanel({ resource, title, onCommitted }: XlsxImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [busy, setBusy] = useState<'template' | 'preview' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [commitResult, setCommitResult] = useState<ImportCommitResponse | null>(null);

  const reportedInvalidCount = countValue(preview?.invalidCount ?? preview?.invalidRows);
  const invalidCount = Math.max(reportedInvalidCount ?? 0, preview?.errors?.length ?? 0);
  const reportedTotalRows = countValue(preview?.totalRows ?? preview?.rowCount) ?? preview?.rows?.length;
  const reportedValidCount = countValue(preview?.validCount ?? preview?.validRows);
  const totalRows = reportedTotalRows ?? (reportedValidCount ?? 0) + invalidCount;
  const validCount = reportedValidCount ?? Math.max(0, totalRows - invalidCount);
  const hasInvalidRows = preview?.valid === false || invalidCount > 0;
  const canCommit = !!preview && preview.valid !== false && totalRows > 0 && invalidCount === 0 && validCount === totalRows;
  const credentials = commitResult?.temporaryCredentials ?? commitResult?.generatedCredentials ?? commitResult?.credentials ?? [];
  const createdCount = commitResult?.createdCount ?? commitResult?.created ?? commitResult?.importedCount ?? 0;

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setError(null);
    setPreview(null);
    setCommitResult(null);
    if (nextFile && !nextFile.name.toLowerCase().endsWith('.xlsx')) {
      setFile(null);
      event.target.value = '';
      setError('Pilih file Excel dengan ekstensi .xlsx.');
      return;
    }
    setFile(nextFile);
  }

  async function getTemplate() {
    setBusy('template');
    setError(null);
    try {
      await downloadFile(`/${resource}/import/template`, getToken(), `template-import-${resource}.xlsx`);
    } catch (reason) {
      setError(errorMessage(reason, 'Gagal mengunduh template impor.'));
    } finally {
      setBusy(null);
    }
  }

  async function runPreview() {
    if (!file) return;
    setBusy('preview');
    setError(null);
    setPreview(null);
    try {
      setPreview(await uploadFile<ImportPreviewResponse>(`/${resource}/import/preview`, file, getToken()));
    } catch (reason) {
      setError(errorMessage(reason, 'Gagal memeriksa file Excel.'));
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    if (!file || !canCommit) return;
    setBusy('commit');
    setError(null);
    try {
      const result = await uploadFile<ImportCommitResponse>(`/${resource}/import/commit`, file, getToken());
      setCommitResult(result);
      setConfirming(false);
      setPreview(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      await onCommitted();
    } catch (reason) {
      setError(errorMessage(reason, 'Gagal mengimpor data.'));
      setConfirming(false);
    } finally {
      setBusy(null);
    }
  }

  return <>
    <Card className="mb-4 overflow-hidden">
      <CardHeader className="border-b bg-slate-50/70 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><CardTitle>{title}</CardTitle><p className="mt-1 text-sm text-slate-500">Gunakan template agar nama dan format kolom sesuai.</p></div>
          <Button type="button" variant="secondary" onClick={getTemplate} disabled={busy !== null}><Download className="size-4" />{busy === 'template' ? 'Mengunduh...' : 'Unduh Template'}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {error && <Alert variant="danger">{error}</Alert>}
        {commitResult && <Alert variant="success" title="Impor selesai">{createdCount} data berhasil dibuat.{credentials.length > 0 && ' Simpan kredensial sementara di bawah sebelum menutup hasil ini.'}</Alert>}
        {commitResult && credentials.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-amber-950">Kredensial sementara</p><p className="mt-1 text-xs text-amber-800">Kredensial juga tersedia melalui tindakan terlindungi di Manajemen User sampai pengguna mengganti password.</p></div><Button type="button" size="sm" variant="ghost" onClick={() => setCommitResult(null)}>Tutup hasil</Button></div>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="text-xs text-amber-900"><tr><th className="pb-2 pr-4">Pengguna</th><th className="pb-2 pr-4">Username / email</th><th className="pb-2">Password sementara</th></tr></thead><tbody>{credentials.map((credential, index) => <tr key={`${credential.username ?? credential.email ?? index}`} className="border-t border-amber-200"><td className="py-2 pr-4">{credential.name ?? credential.employeeName ?? '-'}</td><td className="py-2 pr-4 font-mono text-xs">{credential.username ?? credential.email ?? '-'}</td><td className="py-2 font-mono text-xs">{credential.temporaryPassword ?? credential.password ?? '-'}</td></tr>)}</tbody></table></div>
        </div>}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="block text-sm font-semibold text-slate-700">File Excel (.xlsx)<span className="mt-1 flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 font-normal text-slate-600"><FileSpreadsheet className="size-4 shrink-0 text-emerald-600" /><span className="truncate">{file?.name ?? 'Pilih workbook yang sudah diisi'}</span></span><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={selectFile} className="sr-only" /></label>
          <Button type="button" onClick={runPreview} disabled={!file || busy !== null}><Upload className="size-4" />{busy === 'preview' ? 'Memeriksa...' : 'Pratinjau'}</Button>
        </div>
        {preview && <div className="space-y-3 border-t pt-4">
          <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-100 p-3"><p className="text-xl font-bold text-navy">{totalRows}</p><p className="text-xs text-slate-500">Total baris</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xl font-bold text-emerald-700">{validCount}</p><p className="text-xs text-emerald-700">Valid</p></div><div className="rounded-xl bg-red-50 p-3"><p className="text-xl font-bold text-red-700">{invalidCount}</p><p className="text-xs text-red-700">Tidak valid</p></div></div>
          {hasInvalidRows ? <div className="rounded-xl border border-red-200">{preview.errors?.length ? <ul className="divide-y divide-red-100">{preview.errors.map((rowError, index) => <li key={`${rowError.row}-${index}`} className="flex gap-2 px-3 py-2 text-sm text-red-800"><XCircle className="mt-0.5 size-4 shrink-0" /><span><strong>Baris {rowError.row}:</strong> {messagesFor(rowError).join(', ')}</span></li>)}</ul> : <p className="px-3 py-2 text-sm text-red-800">File belum valid. Periksa format dan isi workbook, lalu jalankan pratinjau kembali.</p>}</div> : <Alert variant="success"><span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4" />Semua {totalRows} baris siap diimpor.</span></Alert>}
          <div className="flex justify-end"><Button type="button" onClick={() => setConfirming(true)} disabled={!canCommit || busy !== null}>Konfirmasi Impor</Button></div>
        </div>}
      </CardContent>
    </Card>
    <Dialog open={confirming} onOpenChange={(open) => { if (!open && busy !== 'commit') setConfirming(false); }}><DialogContent><DialogTitle>Konfirmasi impor {title.toLowerCase()}</DialogTitle><DialogDescription>{validCount} baris valid akan disimpan. Pastikan hasil pratinjau sudah sesuai; tindakan ini tidak dapat dibatalkan dari panel impor.</DialogDescription><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={busy === 'commit'}>Batal</Button><Button type="button" onClick={commit} disabled={busy === 'commit' || !canCommit}>{busy === 'commit' ? 'Mengimpor...' : `Impor ${validCount} Baris`}</Button></div></DialogContent></Dialog>
  </>;
}
