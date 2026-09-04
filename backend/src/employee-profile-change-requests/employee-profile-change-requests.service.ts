import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateProfileChangeRequestDto } from './dto/create-profile-change-request.dto';
import { ProfileChangeDecisionDto, ReviewProfileChangeRequestDto } from './dto/review-profile-change-request.dto';

const ALLOWED_FIELDS = ['address', 'phone', 'email', 'bankAccountNumber', 'photoUrl'] as const;

@Injectable()
export class EmployeeProfileChangeRequestsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProfileChangeRequestDto, actor: AuthenticatedUser) {
    const employee = await this.ownEmployee(actor.userId);
    const changes = this.validateChanges(dto.changes);
    const current = Object.fromEntries(Object.keys(changes).map((key) => [key, (employee as any)[key]]));
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.employeeProfileChangeRequest.create({
        data: { employeeId: employee.id, requestedById: actor.userId, requestedChanges: { current, proposed: changes, reason: dto.reason } },
      });
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'EMPLOYEE_PROFILE_CHANGE_REQUEST_CREATE', entity: 'EmployeeProfileChangeRequest', entityId: request.id, newValue: { fields: Object.keys(changes) }, reason: dto.reason, source: 'PROFILE_CHANGE', relatedEntityId: employee.id } });
      return request;
    });
  }

  async findMine(actor: AuthenticatedUser) {
    const employee = await this.ownEmployee(actor.userId);
    return this.prisma.employeeProfileChangeRequest.findMany({ where: { employeeId: employee.id }, orderBy: { requestedAt: 'desc' } });
  }

  findAll(status?: string) {
    return this.prisma.employeeProfileChangeRequest.findMany({ where: status ? { status: status as any } : undefined, include: { employee: { select: { id: true, name: true, employeeNumber: true } } }, orderBy: { requestedAt: 'desc' } });
  }

  async review(id: string, dto: ReviewProfileChangeRequestDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.employeeProfileChangeRequest.findUnique({ where: { id }, include: { employee: true } });
      if (!request) throw new NotFoundException('Pengajuan perubahan profil tidak ditemukan');
      if (request.status !== 'PENDING') throw new BadRequestException('Pengajuan sudah diputuskan dan tidak dapat ditinjau ulang');
      const payload = request.requestedChanges as any;
      const changes = this.validateChanges(payload?.proposed);
      const note = dto.reviewNote ?? null;
      if (dto.decision === ProfileChangeDecisionDto.REJECTED) {
        const rejected = await tx.employeeProfileChangeRequest.update({ where: { id }, data: { status: 'REJECTED', reviewedById: actor.userId, reviewedAt: new Date(), reviewNote: note } });
        await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'EMPLOYEE_PROFILE_CHANGE_REQUEST_REJECT', entity: 'EmployeeProfileChangeRequest', entityId: id, oldValue: { status: 'PENDING' }, newValue: { status: 'REJECTED' }, reason: note, source: 'PROFILE_CHANGE', relatedEntityId: request.employeeId } });
        return rejected;
      }
      const employee = await tx.employee.update({ where: { id: request.employeeId }, data: changes });
      const approved = await tx.employeeProfileChangeRequest.update({ where: { id }, data: { status: 'APPROVED', reviewedById: actor.userId, reviewedAt: new Date(), reviewNote: note, appliedChanges: changes } });
      const fields = Object.keys(changes);
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'EMPLOYEE_PROFILE_CHANGE_REQUEST_APPROVE', entity: 'EmployeeProfileChangeRequest', entityId: id, oldValue: { status: 'PENDING', fields }, newValue: { status: 'APPROVED', fields }, reason: note, source: 'PROFILE_CHANGE', relatedEntityId: employee.id } });
      return approved;
    });
  }

  private async ownEmployee(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user?.employeeId) throw new ForbiddenException('Akun ini belum terhubung ke profil karyawan');
    const employee = await this.prisma.employee.findUnique({ where: { id: user.employeeId } });
    if (!employee) throw new NotFoundException('Profil karyawan tidak ditemukan');
    return employee;
  }

  private validateChanges(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Perubahan profil tidak valid');
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0 || entries.some(([key, item]) => !ALLOWED_FIELDS.includes(key as any) || typeof item !== 'string' || item.trim().length === 0)) {
      throw new BadRequestException('Field perubahan profil tidak diizinkan');
    }
    return Object.fromEntries(entries) as Partial<Record<(typeof ALLOWED_FIELDS)[number], string>>;
  }
}
