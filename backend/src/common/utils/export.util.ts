import * as ExcelJS from 'exceljs';
import PDFDocument = require('pdfkit');

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

/** Builds a single-sheet XLSX file from rows of plain objects. */
export async function buildXlsx(sheetName: string, columns: ExportColumn[], rows: Record<string, unknown>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export interface PayslipData {
  companyName: string;
  employeeName: string;
  periodLabel: string;
  basisLabel: string;
  baseSalary: number;
  earnings: { label: string; amount: number; note?: string | null }[];
  deductions: { label: string; amount: number; note?: string | null }[];
  netPay: number;
  generatedAt: Date;
}

function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString('id-ID')}`;
}

/** Dedicated payslip layout — separate from the generic tabular report builder above. */
export function buildPayslipPdf(data: PayslipData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).font('Helvetica-Bold').text(data.companyName);
    doc.fontSize(12).font('Helvetica').fillColor('#334155').text('Slip Gaji');
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#64748b').text(`Dicetak: ${data.generatedAt.toLocaleString('id-ID')}`);
    doc.moveDown(1);

    doc.fontSize(11).fillColor('#0f172a').font('Helvetica-Bold').text(data.employeeName);
    doc.fontSize(10).font('Helvetica').fillColor('#475569').text(`Periode: ${data.periodLabel}`);
    doc.text(`Basis gaji: ${data.basisLabel}`);
    doc.moveDown(1);

    const line = (label: string, amount: number, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#0f172a');
      doc.text(label, doc.page.margins.left, doc.y, { continued: true, width: 350 });
      doc.text(formatRupiah(amount), { align: 'right' });
    };

    line('Gaji Pokok', data.baseSalary, true);
    doc.moveDown(0.5);

    if (data.earnings.length > 0) {
      doc.fontSize(9).fillColor('#16a34a').text('TAMBAHAN');
      data.earnings.forEach((e) => line(`  ${e.label}${e.note ? ` (${e.note})` : ''}`, e.amount));
      doc.moveDown(0.3);
    }

    if (data.deductions.length > 0) {
      doc.fontSize(9).fillColor('#dc2626').text('POTONGAN');
      data.deductions.forEach((d) => line(`  ${d.label}${d.note ? ` (${d.note})` : ''}`, -d.amount));
      doc.moveDown(0.3);
    }

    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#cbd5e1').stroke();
    doc.moveDown(0.5);
    doc.fontSize(12);
    line('TOTAL DITERIMA', data.netPay, true);

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#94a3b8').text(
      'Slip ini dibuat otomatis oleh sistem berdasarkan data yang diinput HR/Keuangan. Konfirmasikan ke HR bila ada perbedaan.',
      { width: 460 },
    );

    doc.end();
  });
}

/**
 * Builds a simple tabular PDF report. This is a plain, readable table
 * (not a pixel-perfect grid) — adequate for §16's "export minimal" bar;
 * a branded/templated PDF layout is a later polish item, not a blocker.
 */
export function buildPdf(title: string, columns: ExportColumn[], rows: Record<string, unknown>[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(title, { align: 'left' });
    doc.fontSize(9).fillColor('#64748b').text(`Dicetak: ${new Date().toLocaleString('id-ID')}`);
    doc.moveDown(1);

    const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / columns.length;
    let y = doc.y;

    const drawRow = (values: string[], bold: boolean) => {
      doc.fontSize(9).fillColor(bold ? '#0f172a' : '#334155').font(bold ? 'Helvetica-Bold' : 'Helvetica');
      values.forEach((val, i) => {
        doc.text(val ?? '', doc.page.margins.left + i * colWidth, y, { width: colWidth - 6 });
      });
      y += 18;
      if (y > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
    };

    drawRow(columns.map((c) => c.header), true);
    doc.moveTo(doc.page.margins.left, y - 4).lineTo(doc.page.width - doc.page.margins.right, y - 4).strokeColor('#cbd5e1').stroke();

    rows.forEach((row) => drawRow(columns.map((c) => String(row[c.key] ?? '-')), false));

    doc.end();
  });
}
