import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { startOfCalendarDay } from '../common/domain/date-range';
import { Role } from '../common/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOvertimeRequestDto } from './dto/create-overtime-request.dto';
import { ReviewOvertimeRequestDto } from './dto/review-overtime-request.dto';

const HR_ROLES = [Role.ADMIN_HR, Role.SYSTEM_ADMIN];
const INCLUDE = {
  employee: { select: { id: true, name: true, employeeNumber: true, coordinatorId: true } },
};

@Injectable()
export class OvertimeRequestsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async findAll(actor: AuthenticatedUser) {
    if (actor.role === Role.KARYAWAN) {
      return this.prisma.overtimeRequest.findMany({
        where: { employeeId: await this.resolveOwnEmployeeId(actor.userId) },
        include: INCLUDE,
        orderBy: { requestedAt: 'desc' },
      });
    }
    if (actor.role === Role.KOORDINATOR) {
      return this.prisma.overtimeRequest.findMany({
        where: { employee: { coordinatorId: actor.userId } },
        include: INCLUDE,
        orderBy: { requestedAt: 'desc' },
      });
    }
    if (HR_ROLES.includes(actor.role as Role)) {
      return this.prisma.overtimeRequest.findMany({ include: INCLUDE, orderBy: { requestedAt: 'desc' } });
    }
    throw new ForbiddenException('Anda tidak berwenang mengakses pengajuan lembur');
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const request = await this.getRequest(id);
    await this.assertCanView(request, actor);
    return request;
  }

  async create(dto: CreateOvertimeRequestDto, actor: AuthenticatedUser) {
    if (actor.role !== Role.KARYAWAN) throw new ForbiddenException('Hanya karyawan yang dapat mengajukan lembur sendiri');
    const employeeId = await this.resolveOwnEmployeeId(actor.userId);
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, status: true, joinDate: true } });
    if (!employee) throw new NotFoundException('Data karyawan tidak ditemukan');
    if (employee.status !== 'ACTIVE') throw new BadRequestException('Karyawan tidak memiliki status kerja aktif');

    const details = this.validateDetails(dto);
    if (details.date < startOfCalendarDay(employee.joinDate)) {
      throw new BadRequestException('Tanggal lembur tidak boleh sebelum tanggal bergabung karyawan');
    }
    const request = await this.prisma.overtimeRequest.create({
      data: { employeeId, requestedById: actor.userId, status: 'PENDING', ...details },
      include: INCLUDE,
    });
    await this.record(actor, 'OVERTIME_REQUEST_CREATE', request.id, null, request, dto.reason);
    return request;
  }

  async review(id: string, dto: ReviewOvertimeRequestDto, actor: AuthenticatedUser) {
    const request = await this.getRequest(id);
    if (![Role.KOORDINATOR, ...HR_ROLES].includes(actor.role as Role)) {
      throw new ForbiddenException('Anda tidak berwenang mereview pengajuan lembur');
    }
    if (actor.role === Role.KOORDINATOR && request.employee.coordinatorId !== actor.userId) {
      throw new ForbiddenException('Anda hanya dapat mereview pengajuan tim sendiri');
    }
    if (request.requestedById === actor.userId) throw new ForbiddenException('Anda tidak dapat menyetujui pengajuan sendiri');
    if (request.status !== 'PENDING') throw new BadRequestException(`Pengajuan berstatus ${request.status}, tidak dapat direview`);

    if (dto.approve) await this.assertActiveEmployment(request.employeeId);
    const status = dto.approve ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.overtimeRequest.update({
      where: { id },
      data: { status, reviewedById: actor.userId, reviewedAt: new Date(), reviewNote: dto.note ?? null },
      include: INCLUDE,
    });
    await this.record(actor, 'OVERTIME_REQUEST_REVIEW', id, request, updated, dto.note ?? request.reason);
    return updated;
  }

  async cancel(id: string, actor: AuthenticatedUser) {
    const request = await this.getRequest(id);
    const isOwner = actor.role === Role.KARYAWAN && request.employeeId === await this.resolveOwnEmployeeId(actor.userId);
    if (!isOwner && !HR_ROLES.includes(actor.role as Role)) {
      throw new ForbiddenException('Hanya pemohon atau HR yang dapat membatalkan pengajuan lembur');
    }
    if (request.status !== 'PENDING') throw new BadRequestException(`Pengajuan berstatus ${request.status}, tidak dapat dibatalkan`);

    const updated = await this.prisma.overtimeRequest.update({
      where: { id }, data: { status: 'CANCELLED' }, include: INCLUDE,
    });
    await this.record(actor, 'OVERTIME_REQUEST_CANCEL', id, request, updated, request.reason);
    return updated;
  }

  private validateDetails(dto: CreateOvertimeRequestDto) {
    const date = startOfCalendarDay(dto.date);
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    const reason = dto.reason?.trim();
    if (Number.isNaN(date.getTime()) || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new BadRequestException('Tanggal dan waktu lembur tidak valid');
    }
    if (!reason || reason.length < 3) throw new BadRequestException('Alasan lembur minimal 3 karakter');
    if (startOfCalendarDay(startTime).getTime() !== date.getTime() || startOfCalendarDay(endTime).getTime() !== date.getTime()) {
      throw new BadRequestException('Waktu mulai dan selesai harus berada pada tanggal lembur');
    }
    const durationMs = endTime.getTime() - startTime.getTime();
    if (durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Durasi lembur harus lebih dari 0 dan tidak melebihi 24 jam');
    }
    return { date, startTime, endTime, reason };
  }

  private async getRequest(id: string) {
    const request = await this.prisma.overtimeRequest.findUnique({ where: { id }, include: INCLUDE });
    if (!request) throw new NotFoundException('Pengajuan lembur tidak ditemukan');
    return request;
  }

  private async resolveOwnEmployeeId(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user?.employeeId) throw new BadRequestException('Akun ini belum terhubung ke data karyawan. Hubungi HR.');
    return user.employeeId;
  }

  private async assertActiveEmployment(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { status: true } });
    if (employee?.status !== 'ACTIVE') throw new BadRequestException('Karyawan tidak memiliki status kerja aktif');
  }

  private async assertCanView(request: { employeeId: string; employee: { coordinatorId: string | null } }, actor: AuthenticatedUser) {
    if (HR_ROLES.includes(actor.role as Role)) return;
    if (actor.role === Role.KOORDINATOR && request.employee.coordinatorId === actor.userId) return;
    if (actor.role === Role.KARYAWAN && request.employeeId === await this.resolveOwnEmployeeId(actor.userId)) return;
    throw new ForbiddenException('Anda tidak berwenang mengakses pengajuan lembur');
  }

  private async record(actor: AuthenticatedUser, action: string, entityId: string, oldValue: unknown, newValue: unknown, reason?: string) {
    await this.auditLog.record({
      actorId: actor.userId,
      actorRole: actor.role,
      action,
      entity: 'OvertimeRequest',
      entityId,
      oldValue,
      newValue,
      reason,
      source: 'overtime-requests',
    });
  }
}
