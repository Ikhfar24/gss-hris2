import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { fromBuffer, Entry } from 'yauzl';

export const XLSX_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const XLSX_MAX_ROWS = 2000;
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_MAX_ARCHIVE_ENTRIES = 100;
const XLSX_MAX_EXPANDED_SIZE = 25 * 1024 * 1024;
const XLSX_MAX_ENTRY_SIZE = 10 * 1024 * 1024;
const XLSX_MAX_COMPRESSION_RATIO = 100;

export type XlsxValueType = 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'integerArray';

export interface XlsxImportColumn {
  key: string;
  aliases?: readonly string[];
  type: XlsxValueType;
  required?: boolean;
  description?: string;
  example?: string | number | boolean;
  allowedValues?: readonly (string | boolean)[];
}

export interface XlsxUpload {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
  size?: number;
}

export interface ParsedXlsxRow<T> {
  row: number;
  data: T;
  errors: string[];
}

export function assertSafeXlsxUpload(file?: XlsxUpload): asserts file is XlsxUpload {
  if (!file?.buffer) throw new BadRequestException('File XLSX wajib diunggah pada field file');
  if ((file.size ?? file.buffer.length) > XLSX_MAX_FILE_SIZE || file.buffer.length > XLSX_MAX_FILE_SIZE) {
    throw new BadRequestException('Ukuran file XLSX maksimal 5MB');
  }
  if (file.originalname && !file.originalname.toLowerCase().endsWith('.xlsx')) {
    throw new BadRequestException('File harus menggunakan format .xlsx');
  }
  if (file.mimetype && ![XLSX_MIME, 'application/octet-stream'].includes(file.mimetype)) {
    throw new BadRequestException('Tipe file harus XLSX');
  }
}

export async function buildImportTemplate(sheetName: string, columns: XlsxImportColumn[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Papaiz HRIS';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.properties.defaultRowHeight = 20;
  worksheet.properties.tabColor = { argb: 'FF1E3A5F' };
  worksheet.columns = columns.map((column) => ({
    header: column.key,
    key: column.key,
    width: Math.min(36, Math.max(16, column.key.length + 3, String(column.example ?? '').length + 3)),
  }));
  const dataHeader = worksheet.getRow(1);
  dataHeader.height = 24;
  dataHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  dataHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  dataHeader.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = { from: 'A1', to: `${columnLetter(columns.length)}1` };
  columns.forEach((column, index) => {
    const excelColumn = worksheet.getColumn(index + 1);
    if (column.type === 'string') excelColumn.numFmt = '@';
    if (column.type === 'date') excelColumn.numFmt = 'yyyy-mm-dd';
    if (column.allowedValues?.length) {
      const list = column.allowedValues.map(String).join(',');
      const letter = columnLetter(index + 1);
      (worksheet as any).dataValidations.add(`${letter}2:${letter}${XLSX_MAX_ROWS + 1}`, {
        type: 'list',
        allowBlank: !column.required,
        formulae: [`"${list}"`],
        showErrorMessage: true,
        errorTitle: 'Nilai tidak valid',
        error: `Pilih salah satu nilai yang tersedia untuk ${column.key}.`,
      });
    }
  });

  const instructions = workbook.addWorksheet('Instructions');
  instructions.properties.defaultRowHeight = 32;
  instructions.properties.tabColor = { argb: 'FFF59E0B' };
  instructions.columns = [
    { header: 'Field / Header', key: 'field', width: 28 },
    { header: 'Pengisian', key: 'required', width: 14 },
    { header: 'Tipe Data', key: 'type', width: 16 },
    { header: 'Deskripsi', key: 'description', width: 72 },
    { header: 'Nilai Valid', key: 'allowedValues', width: 54 },
    { header: 'Contoh', key: 'example', width: 42 },
  ];
  for (const column of columns) instructions.addRow({
    field: column.key,
    required: column.required ? 'Wajib' : 'Opsional',
    type: typeLabel(column.type),
    description: column.description ?? '',
    allowedValues: column.allowedValues?.map(String).join(', ') ?? '',
    example: column.example ?? '',
  });
  const instructionHeader = instructions.getRow(1);
  instructionHeader.height = 26;
  instructionHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  instructionHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  instructionHeader.alignment = { vertical: 'middle', horizontal: 'center' };
  instructions.views = [{ state: 'frozen', ySplit: 1 }];
  instructions.autoFilter = { from: 'A1', to: 'F1' };
  instructions.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: 'top', wrapText: true };
    if (row.getCell(2).value === 'Wajib') {
      row.getCell(2).font = { bold: true, color: { argb: 'FF9A3412' } };
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
    }
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function typeLabel(type: XlsxValueType): string {
  return ({ string: 'Teks', number: 'Angka desimal', integer: 'Bilangan bulat', boolean: 'TRUE / FALSE', date: 'Tanggal YYYY-MM-DD', integerArray: 'Daftar bilangan bulat' })[type];
}

export async function parseImportXlsx<T extends Record<string, unknown>>(file: XlsxUpload, columns: XlsxImportColumn[], legacyColumnSets: XlsxImportColumn[][] = []): Promise<ParsedXlsxRow<T>[]> {
  assertSafeXlsxUpload(file);
  await assertSafeXlsxArchive(file.buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(file.buffer) as any);
  } catch {
    throw new BadRequestException('File XLSX tidak valid atau rusak');
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new BadRequestException('File XLSX tidak memiliki worksheet import');
  for (const otherSheet of workbook.worksheets.slice(1)) {
    let containsFormula = false;
    otherSheet.eachRow((row) => row.eachCell((cell) => { if (isFormula(cell.value)) containsFormula = true; }));
    if (containsFormula) throw new BadRequestException('Formula tidak diizinkan di dalam file XLSX');
  }
  if (worksheet.rowCount - 1 > XLSX_MAX_ROWS) throw new BadRequestException(`Jumlah baris XLSX maksimal ${XLSX_MAX_ROWS}`);

  const expectedHeaders = columns.map((column) => column.key);
  const actualHeaders: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    actualHeaders[columnNumber - 1] = stringCellValue(cell.value).trim();
  });
  while (actualHeaders.length && !actualHeaders[actualHeaders.length - 1]) actualHeaders.pop();
  const activeColumns = [columns, ...legacyColumnSets].find((candidateColumns) => headersMatch(actualHeaders, candidateColumns));
  if (!activeColumns) {
    throw new BadRequestException(`Header XLSX harus persis: ${expectedHeaders.join(', ')}`);
  }

  const parsed: ParsedXlsxRow<T>[] = [];
  worksheet.eachRow({ includeEmpty: false }, (excelRow, rowNumber) => {
    if (rowNumber === 1) return;
    const hasValue = excelRow.hasValues;
    if (!hasValue) return;
    const data: Record<string, unknown> = {};
    const errors: string[] = [];
    for (let index = activeColumns.length + 1; index <= excelRow.cellCount; index++) {
      const value = excelRow.getCell(index).value;
      if (isFormula(value)) errors.push(`kolom ${index}: formula tidak diizinkan`);
      else if (!isEmpty(value)) errors.push(`kolom ${index}: field tidak dikenal`);
    }
    activeColumns.forEach((column, index) => {
      const value = excelRow.getCell(index + 1).value;
      if (isFormula(value)) {
        errors.push(`${column.key}: formula tidak diizinkan`);
        return;
      }
      if (isEmpty(value)) {
        if (column.required) errors.push(`${column.key} wajib diisi`);
        return;
      }
      try {
        data[column.key] = convertValue(value, column.type);
      } catch (error) {
        errors.push(`${column.key}: ${error instanceof Error ? error.message : 'nilai tidak valid'}`);
      }
    });
    parsed.push({ row: rowNumber, data: data as T, errors });
  });
  if (parsed.length > XLSX_MAX_ROWS) throw new BadRequestException(`Jumlah baris XLSX maksimal ${XLSX_MAX_ROWS}`);
  if (parsed.length === 0) throw new BadRequestException('File XLSX tidak memiliki baris data');
  return parsed;
}

async function assertSafeXlsxArchive(buffer: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (openError, archive) => {
      if (openError || !archive) {
        reject(new BadRequestException('File XLSX tidak valid atau rusak'));
        return;
      }

      let entryCount = 0;
      let expandedSize = 0;
      let hasContentTypes = false;
      let hasWorkbook = false;
      let settled = false;

      const fail = (message = 'File XLSX tidak valid atau rusak') => {
        if (settled) return;
        settled = true;
        archive.close();
        reject(new BadRequestException(message));
      };

      archive.on('error', () => fail());
      archive.on('entry', (entry: Entry) => {
        entryCount += 1;
        expandedSize += entry.uncompressedSize;
        const normalizedName = entry.fileName.replace(/\\/g, '/').toLowerCase();
        const compressionRatio = entry.compressedSize === 0
          ? (entry.uncompressedSize === 0 ? 1 : Number.POSITIVE_INFINITY)
          : entry.uncompressedSize / entry.compressedSize;

        if (entryCount > XLSX_MAX_ARCHIVE_ENTRIES
          || expandedSize > XLSX_MAX_EXPANDED_SIZE
          || entry.uncompressedSize > XLSX_MAX_ENTRY_SIZE
          || compressionRatio > XLSX_MAX_COMPRESSION_RATIO) {
          fail('File XLSX terlalu kompleks atau ukuran ekstraknya terlalu besar');
          return;
        }
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
          fail('File XLSX terenkripsi tidak didukung');
          return;
        }
        if (normalizedName.includes('vbaproject.bin')
          || normalizedName.includes('/activex/')
          || normalizedName.includes('/embeddings/')
          || normalizedName.includes('/oleobjects/')) {
          fail('File XLSX tidak boleh memuat macro atau objek tertanam');
          return;
        }
        if (normalizedName === '[content_types].xml') hasContentTypes = true;
        if (normalizedName === 'xl/workbook.xml') hasWorkbook = true;
        archive.readEntry();
      });
      archive.on('end', () => {
        if (settled) return;
        settled = true;
        if (!hasContentTypes || !hasWorkbook) {
          reject(new BadRequestException('File XLSX tidak valid atau rusak'));
          return;
        }
        resolve();
      });

      archive.readEntry();
    });
  });
}

function headersMatch(actualHeaders: string[], columns: XlsxImportColumn[]): boolean {
  return actualHeaders.length === columns.length && actualHeaders.every((header, index) => {
    const column = columns[index];
    return [column.key, ...(column.aliases ?? [])].some((candidate) => normalizeHeader(candidate) === normalizeHeader(header));
  });
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function convertValue(value: ExcelJS.CellValue, type: XlsxValueType): unknown {
  const scalar = scalarCellValue(value);
  if (type === 'string') return String(scalar).trim();
  if (type === 'boolean') {
    if (typeof scalar === 'boolean') return scalar;
    const normalized = String(scalar).trim().toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) return true;
    if (['false', 'no', '0'].includes(normalized)) return false;
    throw new Error('gunakan true atau false');
  }
  if (type === 'number' || type === 'integer') {
    const number = typeof scalar === 'number' ? scalar : Number(String(scalar).trim());
    if (!Number.isFinite(number) || (type === 'integer' && !Number.isInteger(number))) throw new Error(type === 'integer' ? 'harus bilangan bulat' : 'harus berupa angka');
    return number;
  }
  if (type === 'integerArray') {
    const values = Array.isArray(scalar) ? scalar : String(scalar).split(',');
    const numbers = values.map((item) => Number(String(item).trim()));
    if (!numbers.length || numbers.some((item) => !Number.isInteger(item))) throw new Error('gunakan daftar bilangan bulat dipisahkan koma');
    return numbers;
  }
  if (scalar instanceof Date && !Number.isNaN(scalar.getTime())) return scalar.toISOString().slice(0, 10);
  if (typeof scalar === 'number') {
    const date = new Date(Date.UTC(1899, 11, 30) + scalar * 86400000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const dateText = String(scalar).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || Number.isNaN(new Date(`${dateText}T00:00:00.000Z`).getTime())) throw new Error('gunakan tanggal YYYY-MM-DD');
  return dateText;
}

function scalarCellValue(value: ExcelJS.CellValue): string | number | boolean | Date | string[] {
  if (value instanceof Date || ['string', 'number', 'boolean'].includes(typeof value)) return value as string | number | boolean | Date;
  if (value && typeof value === 'object' && 'text' in value) return String(value.text);
  if (value && typeof value === 'object' && 'richText' in value) return value.richText.map((part) => part.text).join('');
  throw new Error('tipe nilai tidak didukung');
}

function stringCellValue(value: ExcelJS.CellValue): string {
  if (isFormula(value)) throw new BadRequestException('Formula tidak diizinkan pada header XLSX');
  if (isEmpty(value)) return '';
  return String(scalarCellValue(value));
}

function isFormula(value: ExcelJS.CellValue): boolean {
  return !!value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value);
}

function isEmpty(value: ExcelJS.CellValue): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function columnLetter(column: number): string {
  let result = '';
  while (column > 0) {
    column--;
    result = String.fromCharCode(65 + (column % 26)) + result;
    column = Math.floor(column / 26);
  }
  return result;
}
