import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { validatePayrollCycleDays } from '../common/domain/payroll-foundation';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayrollCycleSettingDto, CreatePayrollPeriodDto, CreatePayrollRevisionDto, RevisionActionDto, UpdatePayrollCycleSettingDto } from './dto/payroll-admin.dto';

const REVISION_INCLUDE = {
  payrollRun: { select: { id: true, periodStart: true, periodEnd: true, status: true } },
  items: { include: { payrollSlip: { select: { id: true, employeeId: true, netPay: true } } } },
};

@Injectable()
export class PayrollAdminService {
  constructor(private prisma: PrismaService, private auditLog: AuditLogService) {}

  async listCycleSettings() {
    return this.prisma.payrollCycleSetting.findMany({
      include: { client: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCycleSetting(dto: CreatePayrollCycleSettingDto, actor: AuthenticatedUser) {
    this.assertCycleScope(dto.clientId, dto.locationId);
    this.assertCycleDays(dto.startDay, dto.endDay);
    await this.assertCycleScopeExists(dto.clientId, dto.locationId);
    const setting = await this.prisma.payrollCycleSetting.create({ data: dto });
    await this.audit('CYCLE_SETTING_CREATE', 'PayrollCycleSetting', setting.id, actor, null, setting);
    return setting;
  }

  async updateCycleSetting(id: string, dto: UpdatePayrollCycleSettingDto, actor: AuthenticatedUser) {
    const current = await this.prisma.payrollCycleSetting.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Pengaturan siklus payroll tidak ditemukan');
    this.assertCycleDays(dto.startDay ?? current.startDay, dto.endDay ?? current.endDay);
    const setting = await this.prisma.payrollCycleSetting.update({ where: { id }, data: dto });
    await this.audit('CYCLE_SETTING_UPDATE', 'PayrollCycleSetting', id, actor, current, setting);
    return setting;
  }

  async listPeriods(cycleSettingId?: string) {
    return this.prisma.payrollPeriod.findMany({
      where: cycleSettingId ? { cycleSettingId } : undefined,
      include: { cycleSetting: true, payrollRun: { select: { id: true, status: true } } },
      orderBy: { periodStart: 'desc' },
    });
  }

  async createPeriod(dto: CreatePayrollPeriodDto, actor: AuthenticatedUser) {
    const setting = await this.prisma.payrollCycleSetting.findUnique({ where: { id: dto.cycleSettingId } });
    if (!setting?.isActive) throw new BadRequestException('Pengaturan siklus payroll tidak aktif atau tidak ditemukan');
    const periodStart = this.date(dto.periodStart);
    const periodEnd = this.date(dto.periodEnd);
    if (periodStart > periodEnd) throw new BadRequestException('Tanggal mulai periode harus sebelum atau sama dengan tanggal akhir');
    if (periodStart.getUTCDate() !== setting.startDay || periodEnd.getUTCDate() !== this.cycleEndDay(periodStart, setting.startDay, setting.endDay)) {
      throw new BadRequestException('Rentang periode tidak sesuai dengan pengaturan siklus payroll');
    }
    const overlap = await this.prisma.payrollPeriod.findFirst({
      where: { cycleSettingId: setting.id, periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } },
    });
    if (overlap) throw new BadRequestException('Periode payroll bertabrakan dengan periode yang sudah ada');
    const period = await this.prisma.payrollPeriod.create({ data: { cycleSettingId: setting.id, periodStart, periodEnd } });
    await this.audit('PERIOD_CREATE', 'PayrollPeriod', period.id, actor, null, period);
    return period;
  }

  async closePeriod(id: string, actor: AuthenticatedUser) {
    const current = await this.period(id);
    if (current.status !== 'OPEN') throw new BadRequestException('Periode payroll sudah ditutup');
    if (current.payrollRun && current.payrollRun.status !== 'FINALIZED') throw new BadRequestException('Payroll run harus finalized sebelum periode ditutup');
    const period = await this.prisma.payrollPeriod.update({ where: { id }, data: { status: 'CLOSED' } });
    await this.audit('PERIOD_CLOSE', 'PayrollPeriod', id, actor, current, period);
    return period;
  }

  async reopenPeriod(id: string, actor: AuthenticatedUser) {
    const current = await this.period(id);
    if (current.status !== 'CLOSED') throw new BadRequestException('Periode payroll belum ditutup');
    if (current.payrollRun) throw new BadRequestException('Periode dengan payroll run tidak dapat dibuka kembali');
    const period = await this.prisma.payrollPeriod.update({ where: { id }, data: { status: 'OPEN' } });
    await this.audit('PERIOD_REOPEN', 'PayrollPeriod', id, actor, current, period);
    return period;
  }

  async listRevisions(payrollRunId?: string) {
    return this.prisma.payrollRevision.findMany({
      where: payrollRunId ? { payrollRunId } : undefined,
      include: REVISION_INCLUDE,
      orderBy: [{ payrollRunId: 'asc' }, { revisionNumber: 'desc' }],
    });
  }

  async getRevision(id: string) {
    const revision = await this.prisma.payrollRevision.findUnique({ where: { id }, include: REVISION_INCLUDE });
    if (!revision) throw new NotFoundException('Revisi payroll tidak ditemukan');
    return revision;
  }

  async createRevision(payrollRunId: string, dto: CreatePayrollRevisionDto, actor: AuthenticatedUser) {
    if (!dto.items.length) throw new BadRequestException('Revisi payroll harus memiliki minimal satu item');
    const run = await this.prisma.payrollRun.findUnique({ where: { id: payrollRunId }, include: { slips: { select: { id: true, netPay: true } } } });
    if (!run) throw new NotFoundException('Payroll run tidak ditemukan');
    if (run.status !== 'FINALIZED') throw new BadRequestException('Revisi hanya dapat dibuat untuk payroll run yang finalized');
    const slips = new Map(run.slips.map((slip) => [slip.id, slip]));
    if (new Set(dto.items.map((item) => item.payrollSlipId)).size !== dto.items.length) throw new BadRequestException('Satu slip hanya dapat direvisi sekali dalam satu revisi');
    for (const item of dto.items) if (!slips.has(item.payrollSlipId)) throw new BadRequestException('Item revisi harus merujuk ke slip dalam payroll run ini');
    const latest = await this.prisma.payrollRevision.aggregate({ where: { payrollRunId }, _max: { revisionNumber: true } });
    const netAdjustment = dto.items.reduce((total, item) => total + (item.type === 'EARNING' ? item.amount : -item.amount), 0);
    const revision = await this.prisma.payrollRevision.create({
      data: {
        payrollRunId, revisionNumber: (latest._max.revisionNumber ?? 0) + 1, reason: dto.reason,
        requestedById: actor.userId, netAdjustment,
        items: { create: dto.items.map((item) => {
          const slip = slips.get(item.payrollSlipId)!;
          const adjustment = item.type === 'EARNING' ? item.amount : -item.amount;
          return { ...item, previousValue: { netPay: slip.netPay }, newValue: { netPay: slip.netPay + adjustment } };
        }) },
      }, include: REVISION_INCLUDE,
    });
    await this.audit('REVISION_CREATE', 'PayrollRevision', revision.id, actor, null, revision, dto.reason, payrollRunId);
    return revision;
  }

  async submitRevision(id: string, actor: AuthenticatedUser) {
    const current = await this.getRevision(id);
    if (current.status !== 'DRAFT') throw new BadRequestException('Hanya revisi draft yang dapat diajukan');
    const revision = await this.prisma.payrollRevision.update({ where: { id }, data: { status: 'PENDING_DIRECTOR_APPROVAL' }, include: REVISION_INCLUDE });
    await this.audit('REVISION_SUBMIT', 'PayrollRevision', id, actor, current, revision, current.reason, current.payrollRunId);
    return revision;
  }

  async approveRevision(id: string, dto: RevisionActionDto, actor: AuthenticatedUser) {
    return this.directorDecision(id, 'APPROVED', dto, actor);
  }

  async rejectRevision(id: string, dto: RevisionActionDto, actor: AuthenticatedUser) {
    return this.directorDecision(id, 'REJECTED', dto, actor);
  }

  async finalizeRevision(id: string, actor: AuthenticatedUser) {
    const current = await this.getRevision(id);
    if (current.status !== 'APPROVED') throw new BadRequestException('Hanya revisi yang disetujui direktur yang dapat difinalisasi');
    const revision = await this.prisma.payrollRevision.update({ where: { id }, data: { status: 'FINALIZED', finalizedById: actor.userId, finalizedAt: new Date() }, include: REVISION_INCLUDE });
    await this.audit('REVISION_FINALIZE', 'PayrollRevision', id, actor, current, revision, current.reason, current.payrollRunId);
    return revision;
  }

  private async directorDecision(id: string, status: 'APPROVED' | 'REJECTED', dto: RevisionActionDto, actor: AuthenticatedUser) {
    const current = await this.getRevision(id);
    if (current.status !== 'PENDING_DIRECTOR_APPROVAL') throw new BadRequestException('Revisi tidak menunggu keputusan direktur');
    const revision = await this.prisma.payrollRevision.update({
      where: { id }, data: { status, directorApprovedById: actor.userId, directorApprovedAt: new Date(), approvalNote: dto.note }, include: REVISION_INCLUDE,
    });
    await this.audit(`REVISION_${status}`, 'PayrollRevision', id, actor, current, revision, dto.note, current.payrollRunId);
    return revision;
  }

  private async period(id: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id }, include: { payrollRun: { select: { id: true, status: true } } } });
    if (!period) throw new NotFoundException('Periode payroll tidak ditemukan');
    return period;
  }

  private assertCycleScope(clientId?: string, locationId?: string) {
    if ((clientId ? 1 : 0) + (locationId ? 1 : 0) !== 1) throw new BadRequestException('Pilih tepat satu cakupan: klien atau lokasi');
  }

  private assertCycleDays(startDay: number, endDay: number) {
    if (!validatePayrollCycleDays(startDay, endDay)) throw new BadRequestException('Hari awal dan akhir siklus harus antara 1 sampai 31');
  }

  private async assertCycleScopeExists(clientId?: string, locationId?: string) {
    const scope = clientId ? await this.prisma.client.findUnique({ where: { id: clientId } }) : await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!scope) throw new NotFoundException('Cakupan pengaturan siklus tidak ditemukan');
  }

  private date(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Tanggal periode tidak valid');
    return date;
  }

  private cycleEndDay(start: Date, startDay: number, endDay: number) {
    const endMonth = endDay >= startDay ? start.getUTCMonth() : start.getUTCMonth() + 1;
    return new Date(Date.UTC(start.getUTCFullYear(), endMonth + 1, 0)).getUTCDate() < endDay
      ? new Date(Date.UTC(start.getUTCFullYear(), endMonth + 1, 0)).getUTCDate() : endDay;
  }

  private async audit(action: string, entity: string, entityId: string, actor: AuthenticatedUser, oldValue: unknown, newValue: unknown, reason?: string, relatedEntityId?: string) {
    await this.auditLog.record({ actorId: actor.userId, actorRole: actor.role, action: `PAYROLL_${action}`, entity, entityId, oldValue, newValue, reason, source: 'payroll-admin', relatedEntityId });
  }
}
