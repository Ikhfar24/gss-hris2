import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { saveBase64File } from '../common/utils/file-storage.util';
import { toProtectedMediaPath } from '../common/utils/file-storage.util';
import { assertDateRange } from '../common/domain/date-range';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ReviewLeaveRequestDto } from './dto/review-leave-request.dto';

const INCLUDE = {
  employee: { select: { id: true, name: true, employmentType: true, coordinatorId: true } },
};

@Injectable()
export class LeaveRequestsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  private async resolveOwnEmployeeId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user?.employeeId) {
      throw new BadRequestException('Akun ini belum terhubung ke data karyawan. Hubungi HR.');
    }
    return user.employeeId;
  }

  async findAll(actor: AuthenticatedUser) {
    if (actor.role === Role.KARYAWAN) {
      const employeeId = await this.resolveOwnEmployeeId(actor.userId);
      const requests = await this.prisma.leaveRequest.findMany({
        where: { employeeId },
        include: INCLUDE,
        orderBy: { requestedAt: 'desc' },
      });
      return requests.map((request) => this.present(request));
    }

    if (actor.role === Role.KOORDINATOR) {
      // Koordinator only sees requests from employees under their own
      // supervision (Employee.coordinatorId), not the whole company.
      const requests = await this.prisma.leaveRequest.findMany({
        where: { employee: { coordinatorId: actor.userId } },
        include: INCLUDE,
        orderBy: { requestedAt: 'desc' },
      });
      return requests.map((request) => this.present(request));
    }

    // HR/System Admin/Direktur: full visibility for review & monitoring.
    const requests = await this.prisma.leaveRequest.findMany({ include: INCLUDE, orderBy: { requestedAt: 'desc' } });
    return requests.map((request) => this.present(request));
  }

  async findOne(id: string, actor?: AuthenticatedUser) {
    const req = await this.prisma.leaveRequest.findUnique({ where: { id }, include: INCLUDE });
    if (!req) throw new NotFoundException('Pengajuan tidak ditemukan');
    if (actor) await this.assertCanAccess(req, actor);
    return this.present(req);
  }

  async create(dto: CreateLeaveRequestDto, actor: AuthenticatedUser) {
    assertDateRange(dto.startDate, dto.endDate);
    if (dto.type === 'SAKIT' && !dto.documentBase64) {
      throw new BadRequestException('Dokumen medis wajib dilampirkan untuk pengajuan sakit');
    }
    let employeeId: string;
    const maySubmitForOthers = [Role.ADMIN_HR, Role.SYSTEM_ADMIN].includes(actor.role as Role);
    if (!maySubmitForOthers) {
      employeeId = await this.resolveOwnEmployeeId(actor.userId);
    } else {
      // Only authorized HR/System Admin may submit for staff without login access.
      if (!dto.employeeId) throw new BadRequestException('employeeId wajib diisi saat HR mengajukan atas nama karyawan');
      employeeId = dto.employeeId;
    }

    const documentUrl = dto.documentBase64
      ? saveBase64File(dto.documentBase64, `documents/leave/${employeeId}`)
      : null;

    const request = await this.prisma.leaveRequest.create({
      data: {
        employeeId,
        type: dto.type,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        reason: dto.reason,
        documentUrl,
        medicalDocumentUrl: dto.type === 'SAKIT' ? documentUrl : null,
        requiresMedicalDocument: dto.type === 'SAKIT',
        requestedById: actor.userId,
        status: 'PENDING',
      },
      include: INCLUDE,
    });

    await this.auditLog.record({
      actorId: actor.userId,
      action: 'LEAVE_REQUEST_CREATE',
      entity: 'LeaveRequest',
      entityId: request.id,
      newValue: request,
    });

    return this.present(request);
  }

  /**
   * §13: "Workflow approval detail belum final". MVP default: single-step
   * Admin/HR approval for every type, RESIGN included. See README
   * "Keputusan Phase 4" — this may need a Koordinator step first, or a
   * Direktur sign-off for RESIGN specifically, once confirmed by management.
   */
  async review(id: string, dto: ReviewLeaveRequestDto, actor: AuthenticatedUser) {
    const request = await this.findOne(id);
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Pengajuan berstatus ${request.status}, tidak dapat direview`);
    }

    const nextStatus = dto.approve ? 'APPROVED' : 'REJECTED';

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: nextStatus,
        reviewedById: actor.userId,
        reviewedAt: new Date(),
        reviewNote: dto.note ?? null,
      },
      include: INCLUDE,
    });

    if (nextStatus === 'APPROVED' && request.type === 'RESIGN') {
      await this.applyResign(request.employeeId, new Date(request.startDate));
    }

    await this.auditLog.record({
      actorId: actor.userId,
      action: 'LEAVE_REQUEST_REVIEW',
      entity: 'LeaveRequest',
      entityId: id,
      oldValue: { status: request.status },
      newValue: { status: nextStatus },
      reason: dto.note ?? null,
    });

    return this.present(updated);
  }

  async cancel(id: string, actor: AuthenticatedUser) {
    const request = await this.findOne(id, actor);
    const isHr = actor.role === Role.ADMIN_HR || actor.role === Role.SYSTEM_ADMIN;
    const isOwner = !isHr && actor.role === Role.KARYAWAN && request.employeeId === (await this.resolveOwnEmployeeId(actor.userId));

    if (!isOwner && !isHr) {
      throw new ForbiddenException('Hanya pemohon atau HR yang dapat membatalkan pengajuan ini');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Pengajuan berstatus ${request.status}, tidak dapat dibatalkan`);
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: INCLUDE,
    });

    await this.auditLog.record({
      actorId: actor.userId,
      action: 'LEAVE_REQUEST_CANCEL',
      entity: 'LeaveRequest',
      entityId: id,
      oldValue: { status: request.status },
      newValue: { status: 'CANCELLED' },
    });

    return this.present(updated);
  }

  /** Approved RESIGN: mark employee resigned and close out their active
   * placement (never deleted — same BR-006 spirit as Placement history). */
  private async applyResign(employeeId: string, resignDate: Date) {
    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: employeeId },
        data: { status: 'RESIGNED', resignDate },
      });
      await tx.placement.updateMany({
        where: { employeeId, status: 'ACTIVE' },
        data: { status: 'ENDED', endDate: resignDate },
      });
    });
  }

  private async assertCanAccess(request: { employeeId: string; employee: { coordinatorId: string | null } }, actor: AuthenticatedUser) {
    if ([Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.DIREKTUR].includes(actor.role as Role)) return;
    if (actor.role === Role.KOORDINATOR && request.employee.coordinatorId === actor.userId) return;
    const ownEmployeeId = await this.resolveOwnEmployeeId(actor.userId).catch(() => null);
    if (ownEmployeeId === request.employeeId) return;
    throw new ForbiddenException('Anda tidak berhak mengakses pengajuan ini');
  }

  private present<T extends { documentUrl?: string | null }>(request: T): T {
    return { ...request, documentUrl: toProtectedMediaPath(request.documentUrl) };
  }
}
