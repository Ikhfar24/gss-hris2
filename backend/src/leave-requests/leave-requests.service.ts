import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LeaveStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { saveBase64File, toProtectedMediaPath } from '../common/utils/file-storage.util';
import { assertDateRange, dateRangesOverlap, startOfCalendarDay } from '../common/domain/date-range';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ReviewLeaveRequestDto } from './dto/review-leave-request.dto';
import { CoordinatorScopeService } from '../coordinator-scopes/coordinator-scope.service';

const INCLUDE = {
  employee: { select: { id: true, name: true, employmentType: true } },
  approvals: { orderBy: { decidedAt: 'asc' as const } },
};
const HR_ROLES = [Role.ADMIN_HR, Role.SYSTEM_ADMIN];
const REVIEWABLE_STATUSES: LeaveStatus[] = ['PENDING', 'PENDING_COORDINATOR', 'PENDING_HR', 'PENDING_DIRECTOR'];

@Injectable()
export class LeaveRequestsService {
  constructor(private prisma: PrismaService, private scopes: CoordinatorScopeService) {}

  private async resolveOwnEmployeeId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user?.employeeId) throw new BadRequestException('Akun ini belum terhubung ke data karyawan. Hubungi HR.');
    return user.employeeId;
  }

  async findAll(actor: AuthenticatedUser) {
    const where = HR_ROLES.includes(actor.role as Role)
      ? undefined
      : actor.role === Role.DIREKTUR
        ? { status: 'PENDING_DIRECTOR' as LeaveStatus }
        : actor.role === Role.KOORDINATOR
          ? { OR: [await this.scopes.queryWhere(actor.userId), { employee: { user: { is: { id: actor.userId } } } }] }
          : { employeeId: await this.resolveOwnEmployeeId(actor.userId) };
    const requests = await this.prisma.leaveRequest.findMany({ where, include: INCLUDE, orderBy: { requestedAt: 'desc' } });
    return requests.map((request) => this.present(request));
  }

  async findOne(id: string, actor?: AuthenticatedUser) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id }, include: INCLUDE });
    if (!request) throw new NotFoundException('Pengajuan tidak ditemukan');
    if (actor) await this.assertCanAccess(request, actor);
    return this.present(request);
  }

  async create(dto: CreateLeaveRequestDto, actor: AuthenticatedUser) {
    try {
      assertDateRange(dto.startDate, dto.endDate);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (dto.type === 'SAKIT' && !dto.documentBase64) throw new BadRequestException('Dokumen medis wajib dilampirkan untuk pengajuan sakit');
    const maySubmitForOthers = HR_ROLES.includes(actor.role as Role);
    const employeeId = maySubmitForOthers
      ? dto.employeeId ?? (() => { throw new BadRequestException('employeeId wajib diisi saat HR mengajukan atas nama karyawan'); })()
      : await this.resolveOwnEmployeeId(actor.userId);
    const startDate = startOfCalendarDay(dto.startDate);
    const endDate = startOfCalendarDay(dto.endDate ?? dto.startDate);
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
    if (!['TRAINING', 'ACTIVE'].includes(employee.status)) throw new BadRequestException('Karyawan tidak berstatus aktif untuk mengajukan cuti/izin');
    if (startDate < startOfCalendarDay(employee.joinDate)) throw new BadRequestException('Tanggal pengajuan tidak boleh sebelum tanggal bergabung karyawan');

    const overlaps = await this.prisma.leaveRequest.findMany({
      where: { employeeId, status: { in: REVIEWABLE_STATUSES.concat(['APPROVED']) } },
      select: { startDate: true, endDate: true },
    });
    if (overlaps.some((request) => dateRangesOverlap(request.startDate, request.endDate, startDate, endDate))) {
      throw new BadRequestException('Periode pengajuan bertabrakan dengan pengajuan yang masih aktif');
    }

    const workdays = dto.type === 'RESIGN' ? [] : await this.workdays(this.prisma, employeeId, startDate, endDate);
    if (dto.type !== 'RESIGN' && workdays.length === 0) throw new BadRequestException('Pengajuan harus mencakup minimal satu hari kerja');
    if (dto.type === 'CUTI') await this.assertAvailableBalance(this.prisma, employeeId, workdays);

    const documentUrl = dto.documentBase64 ? saveBase64File(dto.documentBase64, `documents/leave/${employeeId}`) : null;
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.leaveRequest.create({
        data: {
          employeeId, type: dto.type, startDate, endDate: dto.endDate ? endDate : null, reason: dto.reason,
          documentUrl, medicalDocumentUrl: dto.type === 'SAKIT' ? documentUrl : null,
          requiresMedicalDocument: dto.type === 'SAKIT', requestedById: actor.userId, status: 'PENDING_COORDINATOR',
        },
        include: INCLUDE,
      });
      await this.audit(tx, actor, 'LEAVE_REQUEST_CREATE', created.id, null, { status: created.status, type: created.type });
      return created;
    });
    return this.present(request);
  }

  async review(id: string, dto: ReviewLeaveRequestDto, actor: AuthenticatedUser) {
    return this.decide(id, dto, actor, false);
  }

  async intervene(id: string, dto: ReviewLeaveRequestDto, actor: AuthenticatedUser) {
    if (!HR_ROLES.includes(actor.role as Role)) throw new ForbiddenException('Hanya HR atau System Admin yang dapat melakukan intervensi');
    if (!dto.note?.trim()) throw new BadRequestException('Alasan intervensi wajib diisi');
    return this.decide(id, dto, actor, true);
  }

  private async decide(id: string, dto: ReviewLeaveRequestDto, actor: AuthenticatedUser, intervention: boolean) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id }, include: INCLUDE });
    if (!request) throw new NotFoundException('Pengajuan tidak ditemukan');
    if (!REVIEWABLE_STATUSES.includes(request.status)) throw new BadRequestException(`Pengajuan berstatus ${request.status}, tidak dapat direview`);
    const stage = this.stageFor(request.status);
    await this.assertCanDecide(request, stage, actor, intervention);
    const now = new Date();
    const finalStatus = dto.approve ? this.nextStatus(request.type, request.employee.employmentType, stage) : 'REJECTED';

    const updated = await this.prisma.$transaction(async (tx) => {
      // The unique request/stage constraint makes historical approval records immutable.
      await tx.leaveApproval.create({ data: { leaveRequestId: id, stage, decision: dto.approve ? 'APPROVED' : 'REJECTED', note: dto.note ?? null, decidedById: actor.userId, decidedAt: now } });
      const isFinal = finalStatus === 'APPROVED';
      const result = await tx.leaveRequest.update({
        where: { id },
        data: { status: finalStatus, ...(isFinal ? { reviewedById: actor.userId, reviewedAt: now, reviewNote: dto.note ?? null } : {}) },
        include: INCLUDE,
      });
      if (isFinal && request.type === 'CUTI') await this.debitLeaveOnce(tx, request, actor.userId);
      if (isFinal && request.type === 'RESIGN' && startOfCalendarDay(request.startDate) <= startOfCalendarDay(now)) {
        await this.applyResign(tx, request.employeeId, startOfCalendarDay(request.startDate), actor);
      }
      await this.audit(tx, actor, intervention ? 'LEAVE_REQUEST_INTERVENTION' : 'LEAVE_REQUEST_REVIEW', id,
        { status: request.status }, { status: finalStatus, stage, decision: dto.approve }, dto.note ?? null);
      return result;
    });
    return this.present(updated);
  }

  async finalizeResignation(id: string, actor: AuthenticatedUser) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id }, include: INCLUDE });
    if (!request) throw new NotFoundException('Pengajuan tidak ditemukan');
    if (request.type !== 'RESIGN' || request.status !== 'APPROVED') throw new BadRequestException('Hanya resign yang telah disetujui yang dapat difinalisasi');
    if (startOfCalendarDay(request.startDate) > startOfCalendarDay(new Date())) throw new BadRequestException('Tanggal efektif resign belum tiba');
    await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { id: request.employeeId }, select: { status: true } });
      if (employee?.status === 'RESIGNED') throw new BadRequestException('Resign sudah difinalisasi');
      await this.applyResign(tx, request.employeeId, startOfCalendarDay(request.startDate), actor);
      await this.audit(tx, actor, 'LEAVE_REQUEST_RESIGN_FINALIZE', id, { employeeStatus: employee?.status }, { employeeStatus: 'RESIGNED' });
    });
    return this.findOne(id, actor);
  }

  async cancel(id: string, actor: AuthenticatedUser) {
    const request = await this.findOne(id, actor);
    const isHr = HR_ROLES.includes(actor.role as Role);
    const isOwner = actor.role === Role.KARYAWAN && request.employeeId === await this.resolveOwnEmployeeId(actor.userId);
    if (!isOwner && !isHr) throw new ForbiddenException('Hanya pemohon atau HR yang dapat membatalkan pengajuan ini');
    if (!REVIEWABLE_STATUSES.includes(request.status)) throw new BadRequestException(`Pengajuan berstatus ${request.status}, tidak dapat dibatalkan`);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' }, include: INCLUDE });
      await this.audit(tx, actor, 'LEAVE_REQUEST_CANCEL', id, { status: request.status }, { status: 'CANCELLED' });
      return result;
    });
    return this.present(updated);
  }

  private stageFor(status: string): 'COORDINATOR' | 'HR' | 'DIRECTOR' {
    if (status === 'PENDING_COORDINATOR') return 'COORDINATOR';
    if (status === 'PENDING_HR' || status === 'PENDING') return 'HR';
    if (status === 'PENDING_DIRECTOR') return 'DIRECTOR';
    throw new BadRequestException('Tahap approval tidak valid');
  }

  private nextStatus(type: string, employmentType: string, stage: string) {
    if (stage === 'COORDINATOR') return type.startsWith('IZIN_') ? 'APPROVED' : 'PENDING_HR';
    if (stage === 'HR' && type === 'RESIGN' && employmentType === 'TENAGA_ARSIPARIS') return 'PENDING_DIRECTOR';
    return 'APPROVED';
  }

  private async assertCanDecide(request: any, stage: string, actor: AuthenticatedUser, intervention: boolean) {
    if (intervention) return;
    if (stage === 'COORDINATOR' && actor.role === Role.KOORDINATOR) { await this.scopes.assertEmployee(actor.userId, request.employee); return; }
    if (stage === 'HR' && HR_ROLES.includes(actor.role as Role)) return;
    if (stage === 'DIRECTOR' && (actor.role === Role.DIREKTUR || actor.role === Role.SYSTEM_ADMIN)) return;
    throw new ForbiddenException('Anda tidak berwenang pada tahap approval ini');
  }

  private async workdays(db: PrismaService | Prisma.TransactionClient, employeeId: string, start: Date, end: Date): Promise<Date[]> {
    const dates: Date[] = [];
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const day = new Date(date);
      const placement = await db.placement.findFirst({
        where: { employeeId, status: { in: ['ACTIVE', 'SCHEDULED'] }, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] },
        include: { location: { select: { id: true, workDays: true } } }, orderBy: { startDate: 'desc' },
      });
      if (!placement) throw new BadRequestException('Karyawan tidak memiliki penempatan aktif pada periode pengajuan');
      if (!placement.location.workDays.includes(day.getDay())) continue;
      const holiday = await db.holiday.findFirst({ where: { date: day, OR: [{ locationId: null }, { locationId: placement.locationId }] } });
      if (!holiday) dates.push(day);
    }
    return dates;
  }

  private async assertAvailableBalance(db: PrismaService | Prisma.TransactionClient, employeeId: string, days: Date[]) {
    const needed = this.daysByYear(days);
    for (const [year, count] of needed) {
      const balance = await db.leaveBalance.findUnique({ where: { employeeId_year: { employeeId, year } } });
      if (!balance || balance.remainingDays < count) throw new BadRequestException('Saldo cuti belum diinisialisasi atau tidak mencukupi');
    }
  }

  private daysByYear(days: Date[]) {
    const result = new Map<number, number>();
    for (const day of days) result.set(day.getFullYear(), (result.get(day.getFullYear()) ?? 0) + 1);
    return result;
  }

  private async debitLeaveOnce(tx: Prisma.TransactionClient, request: any, actorId: string) {
    const alreadyDebited = await tx.leaveBalanceTransaction.findFirst({ where: { leaveRequestId: request.id, type: 'APPROVED_LEAVE' } });
    if (alreadyDebited) return;
    const days = await this.workdays(tx, request.employeeId, startOfCalendarDay(request.startDate), startOfCalendarDay(request.endDate ?? request.startDate));
    for (const [year, count] of this.daysByYear(days)) {
      const balance = await tx.leaveBalance.findUnique({ where: { employeeId_year: { employeeId: request.employeeId, year } } });
      if (!balance || balance.remainingDays < count) throw new BadRequestException('Saldo cuti tidak mencukupi saat final approval');
      const changed = await tx.leaveBalance.updateMany({ where: { id: balance.id, remainingDays: { gte: count } }, data: { usedDays: { increment: count }, remainingDays: { decrement: count } } });
      if (changed.count !== 1) throw new BadRequestException('Saldo cuti berubah, ulangi approval');
      await tx.leaveBalanceTransaction.create({ data: { leaveBalanceId: balance.id, leaveRequestId: request.id, type: 'APPROVED_LEAVE', daysDelta: -count, balanceAfter: balance.remainingDays - count, reason: 'Final approval cuti', createdById: actorId } });
    }
  }

  private async applyResign(tx: Prisma.TransactionClient, employeeId: string, resignDate: Date, actor: AuthenticatedUser) {
    const [users, placements] = await Promise.all([
      tx.user.findMany({ where: { employeeId }, select: { id: true, isActive: true } }),
      tx.placement.findMany({ where: { employeeId, status: 'ACTIVE' }, select: { id: true, endDate: true } }),
    ]);
    await tx.employee.update({ where: { id: employeeId }, data: { status: 'RESIGNED', resignDate } });
    await tx.user.updateMany({ where: { employeeId }, data: { isActive: false } });
    await tx.placement.updateMany({ where: { employeeId, status: 'ACTIVE' }, data: { status: 'ENDED', endDate: resignDate } });
    await this.audit(tx, actor, 'EMPLOYEE_RESIGNED', employeeId, null, { status: 'RESIGNED', resignDate }, null, 'Employee');
    for (const user of users) {
      await this.audit(tx, actor, 'USER_DEACTIVATED_FOR_RESIGN', user.id, { isActive: user.isActive }, { isActive: false }, null, 'User');
    }
    for (const placement of placements) {
      await this.audit(tx, actor, 'PLACEMENT_ENDED_FOR_RESIGN', placement.id, { endDate: placement.endDate }, { status: 'ENDED', endDate: resignDate }, null, 'Placement');
    }
  }

  private audit(tx: Prisma.TransactionClient, actor: AuthenticatedUser, action: string, entityId: string, oldValue?: unknown, newValue?: unknown, reason?: string | null, entity = 'LeaveRequest') {
    return tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as any, action, entity, entityId, oldValue: oldValue as any, newValue: newValue as any, reason: reason ?? null, source: 'leave-requests' } });
  }

  private async assertCanAccess(request: { employeeId: string; employee: { employmentType: string } }, actor: AuthenticatedUser) {
    if ([Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.DIREKTUR].includes(actor.role as Role)) return;
    if (await this.resolveOwnEmployeeId(actor.userId).catch(() => null) === request.employeeId) return;
    if (actor.role === Role.KOORDINATOR) { await this.scopes.assertEmployee(actor.userId, request.employee); return; }
    throw new ForbiddenException('Anda tidak berhak mengakses pengajuan ini');
  }

  private present<T extends { documentUrl?: string | null }>(request: T): T {
    return { ...request, documentUrl: toProtectedMediaPath(request.documentUrl) };
  }
}
