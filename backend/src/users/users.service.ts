import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

const SAFE_SELECT = {
  id: true, employeeId: true, name: true, email: true, role: true, isActive: true,
  lastLoginAt: true, createdAt: true, updatedAt: true,
  employee: { select: { id: true, name: true, status: true, employeeNumber: true } },
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: { search?: string; role?: Role; isActive?: boolean; page?: number; pageSize?: number } = {}) {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);
    const where = {
      role: query.role,
      isActive: query.isActive,
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' as const } }, { email: { contains: query.search, mode: 'insensitive' as const } }] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: SAFE_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.user.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE_SELECT });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    return user;
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    if (await this.prisma.user.findUnique({ where: { email: dto.email } })) throw new ConflictException('Email sudah terdaftar');
    await this.assertEmployeeLinkAvailable(dto.employeeId);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name: dto.name, email: dto.email, passwordHash, role: dto.role, employeeId: dto.employeeId }, select: SAFE_SELECT });
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'USER_CREATE', entity: 'User', entityId: user.id, newValue: user as any, source: 'USER_MANAGEMENT', relatedEntityId: user.employeeId } });
      return user;
    });
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser) {
    const before = await this.findOne(id);
    const linkChanged = dto.employeeId !== undefined && dto.employeeId !== before.employeeId;
    const roleChanged = dto.role !== undefined && dto.role !== before.role;
    const statusChanged = dto.isActive !== undefined && dto.isActive !== before.isActive;
    const sensitive = linkChanged || roleChanged || statusChanged;
    if (sensitive && !dto.reason?.trim()) throw new BadRequestException('Alasan wajib diisi untuk perubahan role, status, atau tautan karyawan');
    if (dto.email && dto.email !== before.email) {
      const duplicate = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (duplicate) throw new ConflictException('Email sudah terdaftar');
    }
    if (linkChanged) await this.assertEmployeeLinkAvailable(dto.employeeId ?? undefined, id);
    if (dto.isActive === true && before.employee?.status === 'RESIGNED') {
      throw new BadRequestException('Akun karyawan yang telah mengundurkan diri tidak dapat diaktifkan kembali tanpa proses status kerja baru');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { name: dto.name, email: dto.email, role: dto.role, isActive: dto.isActive, employeeId: dto.employeeId },
        select: SAFE_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId, actorRole: actor.role as Role,
          action: sensitive ? 'USER_LIFECYCLE_UPDATE' : 'USER_UPDATE', entity: 'User', entityId: id,
          oldValue: sensitive ? { role: before.role, isActive: before.isActive, employeeId: before.employeeId } : before as any,
          newValue: sensitive ? { role: updated.role, isActive: updated.isActive, employeeId: updated.employeeId } : updated as any,
          reason: dto.reason ?? null, source: 'USER_MANAGEMENT', relatedEntityId: updated.employeeId,
        },
      });
      return updated;
    });
  }

  deactivate(id: string, reason: string, actor: AuthenticatedUser) {
    return this.update(id, { isActive: false, reason }, actor);
  }

  reactivate(id: string, reason: string, actor: AuthenticatedUser) {
    return this.update(id, { isActive: true, reason }, actor);
  }

  async resetPassword(id: string, password: string, reason: string, actor: AuthenticatedUser) {
    await this.findOne(id);
    const passwordHash = await bcrypt.hash(password, 10);
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'USER_PASSWORD_ADMIN_RESET', entity: 'User', entityId: id, reason, source: 'USER_MANAGEMENT' } });
      return { reset: true };
    });
  }

  async remove(id: string, reason: string, actor: AuthenticatedUser) {
    const user = await this.findOne(id);
    const [auditCount, employee] = await Promise.all([
      this.prisma.auditLog.count({ where: { OR: [{ actorId: id }, { entity: 'User', entityId: id }] } }),
      user.employeeId ? this.prisma.employee.findUnique({ where: { id: user.employeeId }, select: { _count: { select: { attendances: true, leaveRequests: true, placements: true, contracts: true, payrollSlips: true } } } }) : null,
    ]);
    const protectedEmployeeHistory = employee && Object.values(employee._count).some((count) => count > 0);
    if (auditCount > 0 || protectedEmployeeHistory) {
      throw new ConflictException('User memiliki riwayat terlindungi dan tidak dapat dihapus. Gunakan nonaktifkan akun.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id } });
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'USER_DELETE_SAFE', entity: 'User', entityId: id, oldValue: user as any, reason, source: 'USER_MANAGEMENT' } });
    });
    return { deleted: true };
  }

  private async assertEmployeeLinkAvailable(employeeId?: string, currentUserId?: string) {
    if (!employeeId) return;
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, user: { select: { id: true } } } });
    if (!employee) throw new NotFoundException('Data karyawan untuk tautan akun tidak ditemukan');
    if (employee.user && employee.user.id !== currentUserId) throw new ConflictException('Karyawan ini sudah terhubung ke User lain');
  }
}
