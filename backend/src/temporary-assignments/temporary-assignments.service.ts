import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { assertDateRange, dateRangesOverlap, startOfCalendarDay } from '../common/domain/date-range';
import { Role } from '../common/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { ActionTemporaryAssignmentDto } from './dto/action-temporary-assignment.dto';
import { CreateTemporaryAssignmentDto } from './dto/create-temporary-assignment.dto';
import { ReviewTemporaryAssignmentDto } from './dto/review-temporary-assignment.dto';
import { UpdateTemporaryAssignmentDto } from './dto/update-temporary-assignment.dto';
import { CoordinatorScopeService } from '../coordinator-scopes/coordinator-scope.service';

const INCLUDE = {
  employee: { select: { id: true, name: true, employmentType: true } },
  originPlacement: { include: { location: { select: { id: true, name: true } } } },
  location: { select: { id: true, name: true, clientId: true, isActive: true } },
  client: { select: { id: true, name: true } },
};
const MANAGERS = [Role.ADMIN_HR, Role.SYSTEM_ADMIN];
const BLOCKING_STATUSES: ('PENDING' | 'APPROVED')[] = ['PENDING', 'APPROVED'];

@Injectable()
export class TemporaryAssignmentsService {
  constructor(private prisma: PrismaService, private auditLog: AuditLogService, private scopes: CoordinatorScopeService) {}

  async findAll(actor: AuthenticatedUser) {
    return this.prisma.temporaryAssignment.findMany({
      where: actor.role === Role.KOORDINATOR ? { employee: await this.scopes.employeeWhere(actor.userId) } : undefined,
      include: INCLUDE,
      orderBy: { startDate: 'desc' },
    });
  }

  async findOne(id: string, actor?: AuthenticatedUser) {
    const assignment = await this.prisma.temporaryAssignment.findUnique({ where: { id }, include: INCLUDE });
    if (!assignment) throw new NotFoundException('Penugasan sementara tidak ditemukan');
    if (actor?.role === Role.KOORDINATOR) await this.scopes.assertEmployee(actor.userId, assignment.employee);
    return assignment;
  }

  async create(dto: CreateTemporaryAssignmentDto, actor: AuthenticatedUser) {
    const dates = this.dates(dto.startDate, dto.endDate);
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
    await this.assertTeam(employee, actor);
    if (employee.status !== 'ACTIVE') throw new BadRequestException('Karyawan tidak memiliki status kerja aktif');
    await this.assertValidDetails(dto.employeeId, dto.originPlacementId, dto.locationId, dto.clientId, dates.startDate, dates.endDate);

    const assignment = await this.prisma.temporaryAssignment.create({
      data: { ...dto, ...dates, clientId: dto.clientId ?? null, coordinationNote: dto.coordinationNote ?? null, createdById: actor.userId },
      include: INCLUDE,
    });
    await this.audit('CREATE', assignment.id, actor, null, assignment, dto.reason);
    return assignment;
  }

  async update(id: string, dto: UpdateTemporaryAssignmentDto, actor: AuthenticatedUser) {
    const current = await this.findOne(id, actor);
    this.assertManageOrOwn(current.createdById, actor);
    if (current.status !== 'PENDING') throw new BadRequestException('Hanya penugasan menunggu yang dapat diubah');
    const startDate = dto.startDate ?? current.startDate;
    const endDate = dto.endDate ?? current.endDate;
    const dates = this.dates(startDate, endDate);
    const locationId = dto.locationId ?? current.locationId;
    const clientId = dto.clientId === undefined ? current.clientId : dto.clientId;
    await this.assertValidDetails(current.employeeId, current.originPlacementId, locationId, clientId, dates.startDate, dates.endDate, id);
    const updated = await this.prisma.temporaryAssignment.update({
      where: { id }, data: { ...dto, ...dates, clientId: clientId ?? null }, include: INCLUDE,
    });
    await this.audit('UPDATE', id, actor, current, updated, dto.reason ?? current.reason);
    return updated;
  }

  async review(id: string, dto: ReviewTemporaryAssignmentDto, actor: AuthenticatedUser) {
    const current = await this.findOne(id);
    if (current.status !== 'PENDING') throw new BadRequestException('Penugasan tidak dapat direview');
    if (dto.approve) await this.assertValidDetails(current.employeeId, current.originPlacementId, current.locationId, current.clientId, current.startDate, current.endDate, id);
    const updated = await this.prisma.temporaryAssignment.update({
      where: { id }, data: { status: dto.approve ? 'APPROVED' : 'REJECTED', approvedById: actor.userId, approvedAt: new Date(), approvalNote: dto.note ?? null }, include: INCLUDE,
    });
    await this.audit('REVIEW', id, actor, current, updated, dto.note ?? current.reason);
    return updated;
  }

  async cancel(id: string, dto: ActionTemporaryAssignmentDto, actor: AuthenticatedUser) {
    const current = await this.findOne(id, actor);
    this.assertManageOrOwn(current.createdById, actor);
    if (!['PENDING', 'APPROVED'].includes(current.status)) throw new BadRequestException('Penugasan tidak dapat dibatalkan');
    const updated = await this.prisma.temporaryAssignment.update({ where: { id }, data: { status: 'CANCELLED' }, include: INCLUDE });
    await this.audit('CANCEL', id, actor, current, updated, dto.reason ?? current.reason);
    return updated;
  }

  async complete(id: string, dto: ActionTemporaryAssignmentDto, actor: AuthenticatedUser) {
    const current = await this.findOne(id);
    if (current.status !== 'APPROVED') throw new BadRequestException('Hanya penugasan disetujui yang dapat diselesaikan');
    if (startOfCalendarDay(current.endDate) > startOfCalendarDay(new Date())) throw new BadRequestException('Penugasan belum mencapai tanggal selesai');
    const updated = await this.prisma.temporaryAssignment.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() }, include: INCLUDE });
    await this.audit('COMPLETE', id, actor, current, updated, dto.reason ?? current.reason);
    return updated;
  }

  private dates(start: Date | string, end: Date | string) {
    try { assertDateRange(start, end); } catch (error) { throw new BadRequestException((error as Error).message); }
    return { startDate: startOfCalendarDay(start), endDate: startOfCalendarDay(end) };
  }

  private async assertValidDetails(employeeId: string, originPlacementId: string, locationId: string, clientId: string | null | undefined, startDate: Date, endDate: Date, excludeId?: string) {
    const [origin, location, conflicts] = await Promise.all([
      this.prisma.placement.findUnique({ where: { id: originPlacementId } }),
      this.prisma.location.findUnique({ where: { id: locationId } }),
      this.prisma.temporaryAssignment.findMany({ where: { employeeId, status: { in: BLOCKING_STATUSES }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { startDate: true, endDate: true } }),
    ]);
    if (!origin || origin.employeeId !== employeeId || !['ACTIVE', 'SCHEDULED'].includes(origin.status)
      || startOfCalendarDay(origin.startDate) > startDate || (origin.endDate && startOfCalendarDay(origin.endDate) < endDate)) {
      throw new BadRequestException('Penempatan asal tidak valid untuk seluruh periode penugasan');
    }
    if (!location?.isActive) throw new BadRequestException('Lokasi tujuan tidak aktif atau tidak ditemukan');
    if (locationId === origin.locationId) throw new BadRequestException('Lokasi tujuan harus berbeda dari penempatan asal');
    if (clientId && location.clientId !== clientId) throw new BadRequestException('Klien tujuan tidak sesuai dengan lokasi tujuan');
    if (conflicts.some((item) => dateRangesOverlap(item.startDate, item.endDate, startDate, endDate))) {
      throw new BadRequestException('Periode penugasan bertabrakan dengan penugasan sementara lain');
    }
  }

  private async assertTeam(employee: { employmentType: string }, actor: AuthenticatedUser) {
    if (actor.role === Role.KOORDINATOR) await this.scopes.assertEmployee(actor.userId, employee);
  }

  private assertManageOrOwn(createdById: string, actor: AuthenticatedUser) {
    if (!MANAGERS.includes(actor.role as Role) && createdById !== actor.userId) throw new ForbiddenException('Anda tidak dapat mengelola penugasan ini');
  }

  private async audit(action: string, id: string, actor: AuthenticatedUser, oldValue: unknown, newValue: unknown, reason: string) {
    await this.auditLog.record({ actorId: actor.userId, actorRole: actor.role, action: `TEMPORARY_ASSIGNMENT_${action}`, entity: 'TemporaryAssignment', entityId: id, oldValue, newValue, reason, source: 'temporary-assignments' });
  }
}
