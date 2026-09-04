import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { buildPdf, buildPayslipPdf, buildXlsx, ExportColumn } from '../common/utils/export.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLineItemDto } from './dto/create-line-item.dto';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { ReasonDto, RecordPaymentDto } from './dto/payroll-workflow.dto';

const FINANCE = Role.KEUANGAN;
const DIRECTOR = Role.DIREKTUR;
const HR = Role.ADMIN_HR;

function dateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

@Injectable()
export class PayrollService {
  constructor(private prisma: PrismaService, private auditLog: AuditLogService) {}

  private finance(actor: AuthenticatedUser) {
    if (actor.role !== FINANCE) throw new ForbiddenException('Hanya Keuangan yang dapat mengelola payroll');
  }

  private director(actor: AuthenticatedUser) {
    if (actor.role !== DIRECTOR) throw new ForbiddenException('Hanya Direktur yang dapat menyetujui payroll');
  }

  private async audit(actor: AuthenticatedUser, action: string, entity: string, entityId: string, reason: string, newValue?: unknown) {
    await this.auditLog.record({
      actorId: actor.userId,
      actorRole: actor.role,
      action,
      entity,
      entityId,
      reason,
      source: 'PAYROLL_BATCH6',
      newValue,
    });
  }

  async createRun(dto: CreatePayrollRunDto, actor: AuthenticatedUser) {
    this.finance(actor);
    const payrollPeriod = dto.payrollPeriodId
      ? await this.prisma.payrollPeriod.findUnique({ where: { id: dto.payrollPeriodId }, include: { cycleSetting: true } })
      : null;
    if (dto.payrollPeriodId && (!payrollPeriod || payrollPeriod.status !== 'OPEN')) {
      throw new BadRequestException('Periode payroll tidak ditemukan atau sudah ditutup');
    }
    if (!payrollPeriod && (!dto.periodStart || !dto.periodEnd)) {
      throw new BadRequestException('Pilih periode payroll atau isi rentang tanggal');
    }
    const periodStart = payrollPeriod?.periodStart ?? dateOnly(dto.periodStart!);
    const periodEnd = payrollPeriod?.periodEnd ?? dateOnly(dto.periodEnd!);
    if (periodEnd < periodStart) throw new BadRequestException('Tanggal selesai periode tidak boleh sebelum tanggal mulai');

    const run = await this.prisma.payrollRun.create({ data: { periodStart, periodEnd, payrollPeriodId: payrollPeriod?.id, createdById: actor.userId } });
    const employees = await this.prisma.employee.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRAINING', 'ON_LEAVE'] },
        ...(payrollPeriod?.cycleSetting.locationId ? { placements: { some: { locationId: payrollPeriod.cycleSetting.locationId, startDate: { lte: periodEnd }, OR: [{ endDate: null }, { endDate: { gte: periodStart } }] } } } : {}),
        ...(payrollPeriod?.cycleSetting.clientId ? { placements: { some: { location: { clientId: payrollPeriod.cycleSetting.clientId }, startDate: { lte: periodEnd }, OR: [{ endDate: null }, { endDate: { gte: periodStart } }] } } } : {}),
      },
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
    const skipped: string[] = [];

    for (const employee of employees) {
      const contract = employee.contracts[0];
      if (contract?.baseSalary) {
        await this.prisma.payrollSlip.create({
          data: { payrollRunId: run.id, employeeId: employee.id, basis: 'CONTRACT', baseSalary: contract.baseSalary, netPay: contract.baseSalary },
        });
        continue;
      }

      if (employee.employmentType === 'TENAGA_BORONGAN' && employee.dailyRate) {
        // Only reviewed and payable attendance can earn a Borongan daily rate.
        const payableDays = await this.prisma.attendance.count({
          where: { employeeId: employee.id, date: { gte: periodStart, lte: periodEnd }, payableStatus: 'PAYABLE' },
        });
        const baseSalary = employee.dailyRate * payableDays;
        await this.prisma.payrollSlip.create({
          data: {
            payrollRunId: run.id,
            employeeId: employee.id,
            basis: 'DAILY_RATE',
            dailyRate: employee.dailyRate,
            presentDays: payableDays,
            baseSalary,
            netPay: baseSalary,
          },
        });
        continue;
      }

      skipped.push(employee.name);
    }

    await this.audit(actor, 'PAYROLL_RUN_GENERATE', 'PayrollRun', run.id, 'Generate payroll', { periodStart, periodEnd, payrollPeriodId: payrollPeriod?.id ?? null, skipped });
    return { ...(await this.findOne(run.id, actor)), skipped };
  }

  async findAll(actor: AuthenticatedUser) {
    if (actor.role === HR) {
      return this.prisma.payrollRun.findMany({
        orderBy: { periodStart: 'desc' },
        select: { id: true, periodStart: true, periodEnd: true, status: true, _count: { select: { slips: true } } },
      });
    }
    this.finance(actor);
    return this.prisma.payrollRun.findMany({ orderBy: { periodStart: 'desc' }, include: { _count: { select: { slips: true } } } });
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: {
        slips: { include: { employee: { select: { id: true, name: true, employmentType: true } }, items: true }, orderBy: { employee: { name: 'asc' } } },
        payments: true,
      },
    });
    if (!run) throw new NotFoundException('Payroll run tidak ditemukan');
    if (actor.role === HR) return { id: run.id, periodStart: run.periodStart, periodEnd: run.periodEnd, status: run.status, sourceMonitorOnly: true };
    this.finance(actor);
    return run;
  }

  async findMySlips(actor: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({ where: { user: { id: actor.userId } } });
    if (!employee) return [];
    return this.prisma.payrollSlip.findMany({
      where: { employeeId: employee.id, payrollRun: { status: 'FINALIZED' } },
      include: { payrollRun: true, items: true },
      orderBy: { payrollRun: { periodStart: 'desc' } },
    });
  }

  private async editableSlip(slipId: string) {
    const slip = await this.prisma.payrollSlip.findUnique({ where: { id: slipId }, include: { payrollRun: true } });
    if (!slip) throw new NotFoundException('Slip tidak ditemukan');
    if (slip.payrollRun.status !== 'DRAFT') throw new BadRequestException('Hanya payroll DRAFT yang dapat diubah');
    return slip;
  }

  private async recomputeTotals(tx: any, slipId: string) {
    const items = await tx.payrollLineItem.findMany({ where: { payrollSlipId: slipId } });
    const totalEarnings = items.filter((item: any) => item.type === 'EARNING').reduce((total: number, item: any) => total + item.amount, 0);
    const totalDeductions = items.filter((item: any) => item.type === 'DEDUCTION').reduce((total: number, item: any) => total + item.amount, 0);
    const slip = await tx.payrollSlip.findUniqueOrThrow({ where: { id: slipId } });
    return tx.payrollSlip.update({
      where: { id: slipId },
      data: { totalEarnings, totalDeductions, netPay: slip.baseSalary + totalEarnings - totalDeductions },
    });
  }

  async addLineItem(slipId: string, dto: CreateLineItemDto, actor: AuthenticatedUser) {
    this.finance(actor);
    await this.editableSlip(slipId);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.payrollLineItem.create({
        data: { payrollSlipId: slipId, type: dto.type, label: dto.label, amount: dto.amount, note: dto.reason, createdById: actor.userId },
      });
      return this.recomputeTotals(tx, slipId);
    });
    await this.audit(actor, 'PAYROLL_LINE_ITEM_ADD', 'PayrollSlip', slipId, dto.reason, dto);
    return result;
  }

  async removeLineItem(slipId: string, itemId: string, dto: ReasonDto, actor: AuthenticatedUser) {
    this.finance(actor);
    await this.editableSlip(slipId);
    const result = await this.prisma.$transaction(async (tx) => {
      const item = await tx.payrollLineItem.findUnique({ where: { id: itemId } });
      if (!item || item.payrollSlipId !== slipId) throw new NotFoundException('Item tidak ditemukan');
      await tx.payrollLineItem.delete({ where: { id: itemId } });
      return this.recomputeTotals(tx, slipId);
    });
    await this.audit(actor, 'PAYROLL_LINE_ITEM_REMOVE', 'PayrollSlip', slipId, dto.reason);
    return result;
  }

  async review(runId: string, actor: AuthenticatedUser) {
    this.finance(actor);
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run || run.status !== 'DRAFT') throw new BadRequestException('Payroll tidak dapat direview');
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { financeReviewedById: actor.userId, financeReviewedAt: new Date() },
    });
    await this.audit(actor, 'PAYROLL_RUN_REVIEW', 'PayrollRun', runId, 'Finance review complete');
    return updated;
  }

  async submit(runId: string, dto: ReasonDto, actor: AuthenticatedUser) {
    this.finance(actor);
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run?.financeReviewedAt || run.status !== 'DRAFT') throw new BadRequestException('Payroll harus direview Keuangan sebelum dikirim');
    const updated = await this.prisma.payrollRun.update({ where: { id: runId }, data: { status: 'PENDING_DIRECTOR_APPROVAL' } });
    await this.audit(actor, 'PAYROLL_RUN_SUBMIT', 'PayrollRun', runId, dto.reason);
    return updated;
  }

  async directorDecision(runId: string, approve: boolean, dto: ReasonDto, actor: AuthenticatedUser) {
    this.director(actor);
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run || run.status !== 'PENDING_DIRECTOR_APPROVAL') throw new BadRequestException('Payroll tidak menunggu persetujuan Direktur');
    const now = new Date();
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: approve
        ? { status: 'FINALIZED', directorApprovedById: actor.userId, directorApprovedAt: now, finalizedById: actor.userId, finalizedAt: now }
        : { status: 'DRAFT' },
    });
    await this.audit(actor, approve ? 'PAYROLL_RUN_APPROVE_FINALIZE' : 'PAYROLL_RUN_REJECT', 'PayrollRun', runId, dto.reason);
    return updated;
  }

  async recordPayment(runId: string, dto: RecordPaymentDto, actor: AuthenticatedUser) {
    this.finance(actor);
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run || run.status !== 'FINALIZED') throw new BadRequestException('Pembayaran hanya dapat dicatat setelah payroll final');
    const payment = await this.prisma.payrollPayment.create({
      data: { payrollRunId: runId, amount: dto.amount, reference: dto.reference, paidAt: new Date(dto.paidAt), reason: dto.reason, recordedById: actor.userId },
    });
    await this.audit(actor, 'PAYROLL_PAYMENT_RECORD', 'PayrollPayment', payment.id, dto.reason, { runId, amount: dto.amount, reference: dto.reference });
    return payment;
  }

  async exportRun(runId: string, format: 'xlsx' | 'pdf', actor: AuthenticatedUser) {
    this.finance(actor);
    const run: any = await this.findOne(runId, actor);
    const columns: ExportColumn[] = [
      { header: 'Karyawan', key: 'karyawan', width: 24 },
      { header: 'Basis', key: 'basis', width: 14 },
      { header: 'Gaji Pokok', key: 'pokok', width: 14 },
      { header: 'Tambahan', key: 'tambahan', width: 14 },
      { header: 'Potongan', key: 'potongan', width: 14 },
      { header: 'Total Diterima', key: 'total', width: 16 },
    ];
    const rows = run.slips.map((slip: any) => ({
      karyawan: slip.employee.name,
      basis: slip.basis === 'CONTRACT' ? 'Kontrak' : `Harian (${slip.presentDays ?? 0}h)`,
      pokok: `Rp ${slip.baseSalary.toLocaleString('id-ID')}`,
      tambahan: `Rp ${slip.totalEarnings.toLocaleString('id-ID')}`,
      potongan: `Rp ${slip.totalDeductions.toLocaleString('id-ID')}`,
      total: `Rp ${slip.netPay.toLocaleString('id-ID')}`,
    }));
    const title = `Rekap Payroll ${new Date(run.periodStart).toLocaleDateString('id-ID')} - ${new Date(run.periodEnd).toLocaleDateString('id-ID')}`;
    const filename = `rekap-payroll-${run.periodStart.toISOString().slice(0, 10)}`;
    const buffer = format === 'xlsx' ? await buildXlsx('Rekap Payroll', columns, rows) : await buildPdf(title, columns, rows);
    return { buffer, filename: `${filename}.${format}`, mime: format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf' };
  }

  async exportSlip(slipId: string, actor: AuthenticatedUser) {
    const slip: any = await this.prisma.payrollSlip.findUnique({
      where: { id: slipId },
      include: { payrollRun: true, employee: { select: { name: true, user: { select: { id: true } } } }, items: true },
    });
    if (!slip) throw new NotFoundException('Slip tidak ditemukan');
    const isOwner = slip.employee.user?.id === actor.userId;
    if (slip.payrollRun.status !== 'FINALIZED' || (!isOwner && actor.role !== FINANCE)) throw new ForbiddenException('Slip tidak dapat diakses');
    const settings = await this.prisma.companySettings.findFirst();
    const buffer = await buildPayslipPdf({
      companyName: settings?.companyName ?? 'Papaiz.corp',
      employeeName: slip.employee.name,
      periodLabel: `${slip.payrollRun.periodStart.toLocaleDateString('id-ID')} - ${slip.payrollRun.periodEnd.toLocaleDateString('id-ID')}`,
      basisLabel: slip.basis === 'CONTRACT'
        ? 'Gaji Kontrak (PKWT)'
        : `Harian Lepas (${slip.presentDays ?? 0} hari x Rp ${(slip.dailyRate ?? 0).toLocaleString('id-ID')})`,
      baseSalary: slip.baseSalary,
      earnings: slip.items.filter((item: any) => item.type === 'EARNING'),
      deductions: slip.items.filter((item: any) => item.type === 'DEDUCTION'),
      netPay: slip.netPay,
      generatedAt: new Date(),
    });
    return { buffer, filename: `slip-gaji-${slip.employee.name.replace(/\s+/g, '-')}.pdf`, mime: 'application/pdf' };
  }
}
