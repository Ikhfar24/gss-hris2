import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { buildXlsx, buildPdf, buildPayslipPdf, ExportColumn } from '../common/utils/export.util';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { CreateLineItemDto } from './dto/create-line-item.dto';

const READ_ONLY_ROLES = [Role.KEUANGAN, Role.DIREKTUR];
const MANAGE_ROLES = [Role.ADMIN_HR, Role.SYSTEM_ADMIN];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

@Injectable()
export class PayrollService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  // ---------------------------------------------------------------------
  // Run generation
  // ---------------------------------------------------------------------

  /**
   * Creates a payroll period and generates a DRAFT slip per eligible
   * employee. Base pay is a *snapshot* computed once here from either the
   * employee's overlapping active Contract.baseSalary, or
   * Employee.dailyRate × hari hadir dalam periode — never recomputed
   * live, so later contract/rate edits don't silently reopen a run.
   * Employees with neither a usable contract salary nor a dailyRate are
   * skipped and reported back so HR can fill the missing data first.
   */
  async createRun(dto: CreatePayrollRunDto, actor: AuthenticatedUser) {
    const periodStart = startOfDay(new Date(dto.periodStart));
    const periodEnd = startOfDay(new Date(dto.periodEnd));
    if (periodEnd < periodStart) {
      throw new BadRequestException('Tanggal selesai periode tidak boleh sebelum tanggal mulai');
    }

    const employees = await this.prisma.employee.findMany({
      where: { status: { in: ['ACTIVE', 'TRAINING', 'ON_LEAVE'] } },
      include: {
        contracts: {
          where: {
            status: 'ACTIVE',
            startDate: { lte: periodEnd },
            OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
          },
          orderBy: { startDate: 'desc' },
          take: 1,
        },
      },
    });

    const run = await this.prisma.payrollRun.create({
      data: { periodStart, periodEnd, createdById: actor.userId },
    });

    const skipped: string[] = [];

    for (const emp of employees) {
      const contract = emp.contracts[0];
      if (contract?.baseSalary) {
        await this.prisma.payrollSlip.create({
          data: {
            payrollRunId: run.id,
            employeeId: emp.id,
            basis: 'CONTRACT',
            baseSalary: contract.baseSalary,
            netPay: contract.baseSalary,
          },
        });
        continue;
      }

      if (emp.dailyRate) {
        const presentDays = await this.prisma.attendance.count({
          where: { employeeId: emp.id, date: { gte: periodStart, lte: periodEnd }, checkInAt: { not: null } },
        });
        const baseSalary = emp.dailyRate * presentDays;
        await this.prisma.payrollSlip.create({
          data: {
            payrollRunId: run.id,
            employeeId: emp.id,
            basis: 'DAILY_RATE',
            baseSalary,
            dailyRate: emp.dailyRate,
            presentDays,
            netPay: baseSalary,
          },
        });
        continue;
      }

      // Neither an active contract salary nor a daily rate is set — cannot
      // compute a base pay. Deliberately skipped rather than defaulting to
      // Rp0, which could be mistaken for "checked and confirmed zero".
      skipped.push(emp.name);
    }

    await this.auditLog.record({
      actorId: actor.userId,
      action: 'PAYROLL_RUN_CREATE',
      entity: 'PayrollRun',
      entityId: run.id,
      newValue: { periodStart, periodEnd, skipped },
    });

    return this.findOne(run.id, actor, { skipped });
  }

  // ---------------------------------------------------------------------
  // Reads (role-scoped)
  // ---------------------------------------------------------------------

  async findAll(actor: AuthenticatedUser) {
    const isManager = MANAGE_ROLES.includes(actor.role as Role);
    return this.prisma.payrollRun.findMany({
      where: isManager ? {} : { status: 'FINALIZED' },
      orderBy: { periodStart: 'desc' },
      include: { _count: { select: { slips: true } } },
    });
  }

  async findOne(id: string, actor: AuthenticatedUser, extra?: { skipped: string[] }) {
    const isManager = MANAGE_ROLES.includes(actor.role as Role);
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: {
        slips: {
          include: { employee: { select: { id: true, name: true, employmentType: true } }, items: true },
          orderBy: { employee: { name: 'asc' } },
        },
      },
    });
    if (!run) throw new NotFoundException('Payroll run tidak ditemukan');
    if (!isManager && run.status !== 'FINALIZED') {
      throw new ForbiddenException('Payroll run ini belum final');
    }
    return extra ? { ...run, skipped: extra.skipped } : run;
  }

  /** Karyawan's own finalized slips — never their own DRAFT numbers. */
  async findMySlips(actor: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({ where: { user: { id: actor.userId } } });
    if (!employee) return [];
    return this.prisma.payrollSlip.findMany({
      where: { employeeId: employee.id, payrollRun: { status: 'FINALIZED' } },
      include: { payrollRun: true, items: true },
      orderBy: { payrollRun: { periodStart: 'desc' } },
    });
  }

  // ---------------------------------------------------------------------
  // Manual adjustments (DRAFT only)
  // ---------------------------------------------------------------------

  private async getEditableSlip(slipId: string) {
    const slip = await this.prisma.payrollSlip.findUnique({ where: { id: slipId }, include: { payrollRun: true } });
    if (!slip) throw new NotFoundException('Slip tidak ditemukan');
    if (slip.payrollRun.status !== 'DRAFT') {
      throw new BadRequestException('Payroll run sudah final, tidak bisa diubah lagi');
    }
    return slip;
  }

  private async recomputeSlip(slipId: string) {
    const items = await this.prisma.payrollLineItem.findMany({ where: { payrollSlipId: slipId } });
    const totalEarnings = items.filter((i) => i.type === 'EARNING').reduce((s, i) => s + i.amount, 0);
    const totalDeductions = items.filter((i) => i.type === 'DEDUCTION').reduce((s, i) => s + i.amount, 0);
    const slip = await this.prisma.payrollSlip.findUniqueOrThrow({ where: { id: slipId } });
    return this.prisma.payrollSlip.update({
      where: { id: slipId },
      data: { totalEarnings, totalDeductions, netPay: slip.baseSalary + totalEarnings - totalDeductions },
    });
  }

  async addLineItem(slipId: string, dto: CreateLineItemDto, actor: AuthenticatedUser) {
    await this.getEditableSlip(slipId);
    await this.prisma.payrollLineItem.create({
      data: { payrollSlipId: slipId, type: dto.type, label: dto.label, amount: dto.amount, note: dto.note, createdById: actor.userId },
    });
    const updated = await this.recomputeSlip(slipId);
    await this.auditLog.record({
      actorId: actor.userId,
      action: 'PAYROLL_LINE_ITEM_ADD',
      entity: 'PayrollSlip',
      entityId: slipId,
      newValue: dto,
    });
    return updated;
  }

  async removeLineItem(slipId: string, itemId: string, actor: AuthenticatedUser) {
    await this.getEditableSlip(slipId);
    const item = await this.prisma.payrollLineItem.findUnique({ where: { id: itemId } });
    if (!item || item.payrollSlipId !== slipId) throw new NotFoundException('Item tidak ditemukan');
    await this.prisma.payrollLineItem.delete({ where: { id: itemId } });
    const updated = await this.recomputeSlip(slipId);
    await this.auditLog.record({
      actorId: actor.userId,
      action: 'PAYROLL_LINE_ITEM_REMOVE',
      entity: 'PayrollSlip',
      entityId: slipId,
      oldValue: item,
    });
    return updated;
  }

  // ---------------------------------------------------------------------
  // Finalize (locks the run)
  // ---------------------------------------------------------------------

  async finalize(runId: string, actor: AuthenticatedUser) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run tidak ditemukan');
    if (run.status === 'FINALIZED') throw new BadRequestException('Payroll run sudah final sebelumnya');

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'FINALIZED', finalizedById: actor.userId, finalizedAt: new Date() },
    });

    await this.auditLog.record({
      actorId: actor.userId,
      action: 'PAYROLL_RUN_FINALIZE',
      entity: 'PayrollRun',
      entityId: runId,
    });

    return updated;
  }

  // ---------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------

  async exportRun(runId: string, format: 'xlsx' | 'pdf', actor: AuthenticatedUser) {
    const run = await this.findOne(runId, actor); // enforces the same FINALIZED-only rule for Keuangan/Direktur

    const columns: ExportColumn[] = [
      { header: 'Karyawan', key: 'karyawan', width: 24 },
      { header: 'Basis', key: 'basis', width: 14 },
      { header: 'Gaji Pokok', key: 'pokok', width: 14 },
      { header: 'Tambahan', key: 'tambahan', width: 14 },
      { header: 'Potongan', key: 'potongan', width: 14 },
      { header: 'Total Diterima', key: 'total', width: 16 },
    ];
    const rows = run.slips.map((s: any) => ({
      karyawan: s.employee.name,
      basis: s.basis === 'CONTRACT' ? 'Kontrak' : `Harian (${s.presentDays ?? 0}h)`,
      pokok: `Rp ${s.baseSalary.toLocaleString('id-ID')}`,
      tambahan: `Rp ${s.totalEarnings.toLocaleString('id-ID')}`,
      potongan: `Rp ${s.totalDeductions.toLocaleString('id-ID')}`,
      total: `Rp ${s.netPay.toLocaleString('id-ID')}`,
    }));

    const title = `Rekap Payroll ${new Date(run.periodStart).toLocaleDateString('id-ID')} – ${new Date(run.periodEnd).toLocaleDateString('id-ID')}`;
    const filenameBase = `rekap-payroll-${run.periodStart.toString().slice(0, 10)}`;

    if (format === 'xlsx') {
      const buffer = await buildXlsx('Rekap Payroll', columns, rows);
      return { buffer, filename: `${filenameBase}.xlsx`, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    }
    const buffer = await buildPdf(title, columns, rows);
    return { buffer, filename: `${filenameBase}.pdf`, mime: 'application/pdf' };
  }

  async exportSlip(slipId: string, actor: AuthenticatedUser) {
    const slip = await this.prisma.payrollSlip.findUnique({
      where: { id: slipId },
      include: { payrollRun: true, employee: { select: { name: true, user: { select: { id: true } } } }, items: true },
    });
    if (!slip) throw new NotFoundException('Slip tidak ditemukan');

    const isManager = MANAGE_ROLES.includes(actor.role as Role);
    const isReadOnlyReviewer = READ_ONLY_ROLES.includes(actor.role as Role);
    const isOwner = slip.employee.user?.id === actor.userId;

    if (!isManager) {
      if (isOwner || isReadOnlyReviewer) {
        if (slip.payrollRun.status !== 'FINALIZED') {
          throw new ForbiddenException('Slip ini belum final');
        }
      } else {
        throw new ForbiddenException('Anda tidak berhak mengakses slip ini');
      }
    }

    const companySettings = await this.prisma.companySettings.findFirst();
    const periodLabel = `${new Date(slip.payrollRun.periodStart).toLocaleDateString('id-ID')} – ${new Date(slip.payrollRun.periodEnd).toLocaleDateString('id-ID')}`;

    const buffer = await buildPayslipPdf({
      companyName: companySettings?.companyName ?? 'Papaiz.corp',
      employeeName: slip.employee.name,
      periodLabel,
      basisLabel: slip.basis === 'CONTRACT' ? 'Gaji Kontrak (PKWT)' : `Harian Lepas (${slip.presentDays ?? 0} hari × Rp ${(slip.dailyRate ?? 0).toLocaleString('id-ID')})`,
      baseSalary: slip.baseSalary,
      earnings: slip.items.filter((i) => i.type === 'EARNING'),
      deductions: slip.items.filter((i) => i.type === 'DEDUCTION'),
      netPay: slip.netPay,
      generatedAt: new Date(),
    });

    return { buffer, filename: `slip-gaji-${slip.employee.name.replace(/\s+/g, '-')}.pdf`, mime: 'application/pdf' };
  }
}
