import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { CreatePlacementRequestDto } from './dto/create-placement-request.dto';
import { ReviewPlacementRequestDto } from './dto/review-placement-request.dto';
import { assertDateRange, dateRangesOverlap, startOfCalendarDay } from '../common/domain/date-range';

const INCLUDE = {
  employee: { select: { id: true, name: true, employmentType: true } },
  originLocation: { select: { id: true, name: true } },
  destinationLocation: { select: { id: true, name: true } },
};

@Injectable()
export class PlacementRequestsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async findAll(user: AuthenticatedUser) {
    // BR-005/§9.2: Koordinator only sees requests they themselves submitted;
    // HR/Direktur/System Admin see everything for review purposes.
    const isReviewer = [Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.DIREKTUR].includes(
      user.role as Role,
    );

    return this.prisma.placementRequest.findMany({
      where: isReviewer ? undefined : { requestedById: user.userId },
      include: INCLUDE,
      orderBy: { requestedAt: 'desc' },
    });
  }

  async findOne(id: string, actor?: AuthenticatedUser) {
    const req = await this.prisma.placementRequest.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!req) throw new NotFoundException('Pengajuan penempatan tidak ditemukan');
    if (actor?.role === Role.KOORDINATOR && req.requestedById !== actor.userId) {
      throw new ForbiddenException('Anda hanya dapat mengakses pengajuan yang Anda buat');
    }
    return req;
  }

  // §10.2 / §8.2 — request type follows the employee's employment type,
  // not an arbitrary choice by the requester (BR-003/BR-004).
  async create(dto: CreatePlacementRequestDto, actor: AuthenticatedUser) {
    try {
      assertDateRange(dto.startDate, dto.endDate);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      include: { placements: { where: { status: 'ACTIVE' } } },
    });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
    if (actor.role === Role.KOORDINATOR && employee.coordinatorId !== actor.userId) {
      throw new ForbiddenException('Anda hanya dapat mengajukan penempatan untuk tim Anda');
    }

    const currentPlacement = employee.placements[0];
    if (currentPlacement && currentPlacement.locationId === dto.destinationLocationId) {
      throw new BadRequestException('Lokasi tujuan sama dengan lokasi penempatan saat ini');
    }

    const type = employee.employmentType === 'TENAGA_ARSIPARIS' ? 'MUTATION' : 'REASSIGNMENT';

    const request = await this.prisma.placementRequest.create({
      data: {
        employeeId: dto.employeeId,
        type,
        originLocationId: currentPlacement?.locationId ?? null,
        destinationLocationId: dto.destinationLocationId,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        reason: dto.reason,
        requestedById: actor.userId,
        status: 'PENDING_HR',
      },
      include: INCLUDE,
    });

    await this.auditLog.record({
      actorId: actor.userId,
      action: 'PLACEMENT_REQUEST_CREATE',
      entity: 'PlacementRequest',
      entityId: request.id,
      newValue: request,
    });

    return request;
  }

  // Step 1 (both types): HR reviews. REASSIGNMENT finalizes here (BR-005:
  // Koordinator cannot activate directly). MUTATION proceeds to Direktur.
  async hrReview(id: string, dto: ReviewPlacementRequestDto, actor: AuthenticatedUser) {
    const request = await this.findOne(id);
    if (request.status !== 'PENDING_HR') {
      throw new BadRequestException(`Pengajuan berstatus ${request.status}, tidak dapat direview HR`);
    }

    const nextStatus = !dto.approve
      ? 'REJECTED'
      : request.type === 'MUTATION'
        ? 'PENDING_DIRECTOR'
        : 'APPROVED';

    const updated = await this.prisma.placementRequest.update({
      where: { id },
      data: {
        status: nextStatus,
        hrReviewedById: actor.userId,
        hrReviewedAt: new Date(),
        hrNote: dto.note ?? null,
      },
      include: INCLUDE,
    });

    if (nextStatus === 'APPROVED') {
      await this.finalizePlacement(updated);
    }

    await this.auditLog.record({
      actorId: actor.userId,
      action: 'PLACEMENT_REQUEST_HR_REVIEW',
      entity: 'PlacementRequest',
      entityId: id,
      oldValue: { status: request.status },
      newValue: { status: nextStatus },
      reason: dto.note ?? null,
    });

    return this.findOne(id);
  }

  // Step 2 (MUTATION only, §8.2): final Direktur approval.
  async directorApprove(id: string, dto: ReviewPlacementRequestDto, actor: AuthenticatedUser) {
    const request = await this.findOne(id);
    if (request.type !== 'MUTATION') {
      throw new BadRequestException('Hanya mutasi (Tenaga Arsiparis) yang memerlukan approval Direktur');
    }
    if (request.status !== 'PENDING_DIRECTOR') {
      throw new BadRequestException(`Pengajuan berstatus ${request.status}, belum siap untuk approval Direktur`);
    }

    const nextStatus = dto.approve ? 'APPROVED' : 'REJECTED';

    const updated = await this.prisma.placementRequest.update({
      where: { id },
      data: {
        status: nextStatus,
        directorReviewedById: actor.userId,
        directorReviewedAt: new Date(),
        directorNote: dto.note ?? null,
      },
      include: INCLUDE,
    });

    if (nextStatus === 'APPROVED') {
      await this.finalizePlacement(updated);
    }

    await this.auditLog.record({
      actorId: actor.userId,
      action: 'PLACEMENT_REQUEST_DIRECTOR_APPROVE',
      entity: 'PlacementRequest',
      entityId: id,
      oldValue: { status: request.status },
      newValue: { status: nextStatus },
      reason: dto.note ?? null,
    });

    return this.findOne(id);
  }

  async cancel(id: string, actor: AuthenticatedUser) {
    const request = await this.findOne(id);
    const isOwner = request.requestedById === actor.userId;
    const isHr = [Role.ADMIN_HR, Role.SYSTEM_ADMIN].includes(actor.role as Role);
    if (!isOwner && !isHr) {
      throw new ForbiddenException('Hanya pengaju atau HR yang dapat membatalkan pengajuan ini');
    }
    if (!['PENDING_HR', 'PENDING_DIRECTOR'].includes(request.status)) {
      throw new BadRequestException(`Pengajuan berstatus ${request.status}, tidak dapat dibatalkan`);
    }

    const updated = await this.prisma.placementRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: INCLUDE,
    });

    await this.auditLog.record({
      actorId: actor.userId,
      action: 'PLACEMENT_REQUEST_CANCEL',
      entity: 'PlacementRequest',
      entityId: id,
      oldValue: { status: request.status },
      newValue: { status: 'CANCELLED' },
    });

    return updated;
  }

  // BR-001/BR-002/BR-006/BR-007: end the previous active placement (never
  // delete it) and open exactly one new active placement, atomically.
  private async finalizePlacement(request: {
    id: string;
    employeeId: string;
    destinationLocationId: string;
    startDate: Date;
    endDate?: Date | null;
  }) {
    await this.prisma.$transaction(async (tx) => {
      // A scheduled record becomes historical/active only when its effective
      // date arrives; creating it must never close today's active placement.
      await this.activateDuePlacements(tx, request.employeeId, startOfCalendarDay(new Date()));
      const placements = await tx.placement.findMany({
        where: { employeeId: request.employeeId },
        select: { id: true, startDate: true, endDate: true, status: true },
      });
      const conflicts = placements.filter((placement) => placement.status !== 'ACTIVE'
        && dateRangesOverlap(placement.startDate, placement.endDate, request.startDate, request.endDate));
      if (conflicts.length > 0) {
        throw new BadRequestException('Periode penempatan bertabrakan dengan riwayat penempatan yang sudah ada');
      }

      const isFuture = startOfCalendarDay(request.startDate) > startOfCalendarDay(new Date());
      const activePlacements = placements.filter((placement) => placement.status === 'ACTIVE');
      if (activePlacements.length > 1) {
        throw new BadRequestException('Data penempatan aktif ambigu; perbaiki riwayat sebelum menyetujui mutasi baru');
      }
      if (activePlacements[0] && startOfCalendarDay(request.startDate) <= startOfCalendarDay(activePlacements[0].startDate)) {
        throw new BadRequestException('Tanggal efektif penempatan baru harus setelah penempatan aktif saat ini');
      }

      if (isFuture) {
        const scheduledConflict = placements.some((placement) => placement.status === 'SCHEDULED'
          && dateRangesOverlap(placement.startDate, placement.endDate, request.startDate, request.endDate));
        if (scheduledConflict) throw new BadRequestException('Periode penempatan terjadwal bertabrakan');
        await tx.placement.create({
          data: {
            employeeId: request.employeeId,
            locationId: request.destinationLocationId,
            startDate: request.startDate,
            endDate: request.endDate ?? null,
            status: 'SCHEDULED',
            sourceRequestId: request.id,
          },
        });
        return;
      }

      await tx.placement.updateMany({
        where: { employeeId: request.employeeId, status: 'ACTIVE' },
        data: { status: 'ENDED', endDate: new Date(startOfCalendarDay(request.startDate).getTime() - 86400000) },
      });

      await tx.placement.create({
        data: {
          employeeId: request.employeeId,
          locationId: request.destinationLocationId,
          startDate: request.startDate,
          endDate: request.endDate ?? null,
          status: 'ACTIVE',
          sourceRequestId: request.id,
        },
      });
    });
  }

  private async activateDuePlacements(tx: any, employeeId: string, today: Date) {
    const due = await tx.placement.findMany({
      where: { employeeId, status: 'SCHEDULED', startDate: { lte: today } },
      orderBy: { startDate: 'asc' },
    });
    for (const scheduled of due) {
      const effectiveStart = startOfCalendarDay(scheduled.startDate);
      await tx.placement.updateMany({
        where: { employeeId, status: 'ACTIVE' },
        data: { status: 'ENDED', endDate: new Date(effectiveStart.getTime() - 86400000) },
      });
      await tx.placement.update({
        where: { id: scheduled.id },
        data: { status: scheduled.endDate && startOfCalendarDay(scheduled.endDate) < today ? 'ENDED' : 'ACTIVE' },
      });
    }
  }
}
