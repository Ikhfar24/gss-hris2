import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildXlsx, buildPdf, ExportColumn } from '../common/utils/export.util';
import { ExportFormat, ExportQueryDto } from './dto/export-query.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { CoordinatorScopeService } from '../coordinator-scopes/coordinator-scope.service';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const LATENESS_LABEL: Record<string, string> = { ON_TIME: 'Tepat waktu', LATE: 'Terlambat', NOT_APPLICABLE: '-' };
const LEAVE_TYPE_LABEL: Record<string, string> = {
  CUTI: 'Cuti', SAKIT: 'Sakit', IZIN_PULANG_AWAL: 'Izin Pulang Awal',
  IZIN_MENDADAK: 'Izin Mendadak', IZIN_LAIN: 'Izin Lain', RESIGN: 'Resign',
};

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  mime: string;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService, private scopes: CoordinatorScopeService) {}

  private async render(format: ExportFormat, sheetName: string, title: string, columns: ExportColumn[], rows: Record<string, unknown>[], filenameBase: string): Promise<ExportResult> {
    if (format === ExportFormat.XLSX) {
      const buffer = await buildXlsx(sheetName, columns, rows);
      return { buffer, filename: `${filenameBase}.xlsx`, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    }
    const buffer = await buildPdf(title, columns, rows);
    return { buffer, filename: `${filenameBase}.pdf`, mime: 'application/pdf' };
  }

  /** §16 "Rekap absensi / Keterlambatan / Ketidakhadiran" — one combined export, filterable by date range/employee/location. */
  async exportAttendance(query: ExportQueryDto, actor: AuthenticatedUser): Promise<ExportResult> {
    const from = query.from ? startOfDay(new Date(query.from)) : startOfDay(new Date(Date.now() - 30 * 86400000));
    const to = query.to ? startOfDay(new Date(query.to)) : startOfDay(new Date());

    const records = await this.prisma.attendance.findMany({
      where: {
        date: { gte: from, lte: to },
        employeeId: query.employeeId,
        locationId: query.locationId,
        ...(actor.role === Role.KOORDINATOR ? await this.scopes.queryWhere(actor.userId) : {}),
      },
      include: { employee: { select: { name: true } }, location: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { checkInAt: 'asc' }],
    });

    const columns: ExportColumn[] = [
      { header: 'Tanggal', key: 'tanggal', width: 14 },
      { header: 'Karyawan', key: 'karyawan', width: 24 },
      { header: 'Lokasi', key: 'lokasi', width: 20 },
      { header: 'Check-in', key: 'checkIn', width: 12 },
      { header: 'Check-out', key: 'checkOut', width: 12 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Validasi', key: 'validasi', width: 16 },
    ];
    const rows = records.map((r) => ({
      tanggal: r.date.toLocaleDateString('id-ID'),
      karyawan: r.employee.name,
      lokasi: r.location.name,
      checkIn: r.checkInAt ? new Date(r.checkInAt).toLocaleTimeString('id-ID') : '-',
      checkOut: r.checkOutAt ? new Date(r.checkOutAt).toLocaleTimeString('id-ID') : '-',
      status: LATENESS_LABEL[r.latenessStatus] ?? r.latenessStatus,
      validasi: r.validationStatus === 'NEEDS_REVIEW' ? 'Perlu Ditinjau' : 'Valid',
    }));

    return this.render(query.format, 'Rekap Absensi', 'Rekap Absensi', columns, rows, 'rekap-absensi');
  }

  /** §16 "Riwayat penempatan" */
  async exportPlacements(query: ExportQueryDto, actor: AuthenticatedUser): Promise<ExportResult> {
    const records = await this.prisma.placement.findMany({
      where: {
        employeeId: query.employeeId,
        locationId: query.locationId,
        ...(actor.role === Role.KOORDINATOR ? await this.scopes.queryWhere(actor.userId) : {}),
      },
      include: { employee: { select: { name: true, employmentType: true } }, location: { select: { name: true } } },
      orderBy: [{ startDate: 'desc' }],
    });

    const columns: ExportColumn[] = [
      { header: 'Karyawan', key: 'karyawan', width: 24 },
      { header: 'Jenis', key: 'jenis', width: 18 },
      { header: 'Lokasi', key: 'lokasi', width: 20 },
      { header: 'Mulai', key: 'mulai', width: 14 },
      { header: 'Selesai', key: 'selesai', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    const rows = records.map((p) => ({
      karyawan: p.employee.name,
      jenis: p.employee.employmentType === 'TENAGA_BORONGAN' ? 'Borongan' : 'Arsiparis',
      lokasi: p.location.name,
      mulai: p.startDate.toLocaleDateString('id-ID'),
      selesai: p.endDate ? p.endDate.toLocaleDateString('id-ID') : '-',
      status: p.status === 'ACTIVE' ? 'Aktif' : 'Berakhir',
    }));

    return this.render(query.format, 'Riwayat Penempatan', 'Riwayat Penempatan', columns, rows, 'riwayat-penempatan');
  }

  /** §16 "Rekap izin/cuti" */
  async exportLeaveRequests(query: ExportQueryDto, actor: AuthenticatedUser): Promise<ExportResult> {
    const from = query.from ? startOfDay(new Date(query.from)) : undefined;
    const to = query.to ? startOfDay(new Date(query.to)) : undefined;

    const records = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId: query.employeeId,
        status: query.status as any,
        ...(from || to ? { startDate: { gte: from, lte: to } } : {}),
        ...(actor.role === Role.KOORDINATOR ? await this.scopes.queryWhere(actor.userId) : {}),
      },
      include: { employee: { select: { name: true } } },
      orderBy: [{ startDate: 'desc' }],
    });

    const columns: ExportColumn[] = [
      { header: 'Karyawan', key: 'karyawan', width: 24 },
      { header: 'Jenis', key: 'jenis', width: 16 },
      { header: 'Mulai', key: 'mulai', width: 14 },
      { header: 'Selesai', key: 'selesai', width: 14 },
      { header: 'Alasan', key: 'alasan', width: 30 },
      { header: 'Status', key: 'status', width: 14 },
    ];
    const rows = records.map((r) => ({
      karyawan: r.employee.name,
      jenis: LEAVE_TYPE_LABEL[r.type] ?? r.type,
      mulai: r.startDate.toLocaleDateString('id-ID'),
      selesai: r.endDate ? r.endDate.toLocaleDateString('id-ID') : '-',
      alasan: r.reason,
      status: r.status,
    }));

    return this.render(query.format, 'Rekap Cuti & Izin', 'Rekap Cuti & Izin', columns, rows, 'rekap-cuti-izin');
  }
}
