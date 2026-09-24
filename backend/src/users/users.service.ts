import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { TemporaryCredentialService } from '../temporary-credentials/temporary-credential.service';

const SAFE_SELECT = {
  id: true, employeeId: true, name: true, email: true, role: true, isActive: true,
  lastLoginAt: true, mustChangePassword: true, createdAt: true, updatedAt: true,
  employee: { select: { id: true, name: true, status: true, employeeNumber: true } },
  temporaryCredential: { select: { purpose: true, keyVersion: true, createdAt: true, lastRevealedAt: true, revealCount: true } },
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private temporaryCredentials: TemporaryCredentialService) {}

  private present<T extends { temporaryCredential?: any }>(user: T, includeCredential = false) {
    const { temporaryCredential, ...safe } = user;
    if (!includeCredential) return safe;
    return {
      ...safe,
      temporaryCredential: temporaryCredential ? { available: true, ...temporaryCredential } : { available: false },
    };
  }

  async findAll(query: { search?: string; role?: Role; isActive?: boolean; page?: number; pageSize?: number } = {}, actor?: AuthenticatedUser) {
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
    const includeCredential = actor?.role === Role.ADMIN_HR || actor?.role === Role.SYSTEM_ADMIN;
    return { data: data.map((user) => this.present(user, includeCredential)), meta: { page, pageSize, total } };
  }

  async findOne(id: string, actor?: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE_SELECT });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    const includeCredential = actor?.role === Role.ADMIN_HR || actor?.role === Role.SYSTEM_ADMIN;
    return this.present(user, includeCredential);
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    this.assertRoleAssignable(dto.role, actor);
    const email = this.normalizeEmail(dto.email);
    if (await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } })) throw new ConflictException('Email sudah terdaftar');
    await this.assertEmployeeLinkAvailable(dto.employeeId);
    const password = this.temporaryCredentials.generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { name: dto.name.trim(), email, passwordHash, role: dto.role, employeeId: dto.employeeId, mustChangePassword: true }, select: SAFE_SELECT });
        await this.temporaryCredentials.store(tx, user.id, password, 'ACCOUNT_CREATION', actor.userId);
        await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'USER_CREATE', entity: 'User', entityId: user.id, newValue: { id: user.id, email: user.email, role: user.role, employeeId: user.employeeId, temporaryCredentialAvailable: true }, source: 'USER_MANAGEMENT', relatedEntityId: user.employeeId } });
        return this.present({ ...user, temporaryCredential: { available: true, purpose: 'ACCOUNT_CREATION', keyVersion: this.temporaryCredentials.keyVersion, createdAt: new Date(), lastRevealedAt: null, revealCount: 0 } }, true);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Email atau profil karyawan sudah terhubung ke akun lain');
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser) {
    const before = await this.findOne(id, actor);
    this.assertTargetManageable(before.role as Role, actor);
    this.assertRoleAssignable(dto.role, actor);
    const linkChanged = dto.employeeId !== undefined && dto.employeeId !== before.employeeId;
    const roleChanged = dto.role !== undefined && dto.role !== before.role;
    const statusChanged = dto.isActive !== undefined && dto.isActive !== before.isActive;
    const sensitive = linkChanged || roleChanged || statusChanged;
    if (sensitive && !dto.reason?.trim()) throw new BadRequestException('Alasan wajib diisi untuk perubahan role, status, atau tautan karyawan');
    const email = dto.email === undefined ? undefined : this.normalizeEmail(dto.email);
    if (email && email !== before.email) {
      const duplicate = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, id: { not: id } }, select: { id: true } });
      if (duplicate) throw new ConflictException('Email sudah terdaftar');
    }
    if (linkChanged) await this.assertEmployeeLinkAvailable(dto.employeeId ?? undefined, id);
    if (dto.isActive === true && before.employee?.status === 'RESIGNED') {
      throw new BadRequestException('Akun karyawan yang telah mengundurkan diri tidak dapat diaktifkan kembali tanpa proses status kerja baru');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { name: dto.name?.trim(), email, role: dto.role, isActive: dto.isActive, employeeId: dto.employeeId },
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
      return this.present(updated, true);
    });
  }

  deactivate(id: string, reason: string, actor: AuthenticatedUser) {
    return this.update(id, { isActive: false, reason }, actor);
  }

  reactivate(id: string, reason: string, actor: AuthenticatedUser) {
    return this.update(id, { isActive: true, reason }, actor);
  }

  private assertRoleAssignable(role: Role | undefined, actor: AuthenticatedUser) {
    if (role === Role.SYSTEM_ADMIN && actor.role !== Role.SYSTEM_ADMIN) {
      throw new BadRequestException('Hanya System Admin yang dapat menetapkan role System Admin');
    }
  }

  private assertTargetManageable(role: Role, actor: AuthenticatedUser) {
    if (role === Role.SYSTEM_ADMIN && actor.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Hanya System Admin yang dapat mengelola akun System Admin');
    }
  }

  async resetPassword(id: string, currentPassword: string, reason: string, actor: AuthenticatedUser) {
    if (!reason.trim()) throw new BadRequestException('Alasan wajib diisi');
    const user = await this.findOne(id, actor);
    this.assertCredentialTarget(id, user.role as Role, actor);
    await this.reauthenticate(actor.userId, currentPassword);
    const password = this.temporaryCredentials.generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true, passwordChangedAt: null, sessionVersion: { increment: 1 } } });
      await this.temporaryCredentials.store(tx, id, password, 'ADMIN_PASSWORD_RESET', actor.userId);
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'USER_PASSWORD_ADMIN_RESET', entity: 'User', entityId: id, reason, source: 'USER_MANAGEMENT', newValue: { mustChangePassword: true, temporaryCredentialAvailable: true, keyVersion: this.temporaryCredentials.keyVersion } } });
      return { reset: true, temporaryCredential: { available: true, purpose: 'ADMIN_PASSWORD_RESET' } };
    });
  }

  async revealTemporaryCredential(id: string, currentPassword: string, reason: string, actor: AuthenticatedUser) {
    if (!reason.trim()) throw new BadRequestException('Alasan wajib diisi');
    const target = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true, temporaryCredential: true } });
    if (!target) throw new NotFoundException('User tidak ditemukan');
    this.assertCredentialTarget(id, target.role as Role, actor);
    await this.reauthenticate(actor.userId, currentPassword);
    if (!target.temporaryCredential) throw new NotFoundException('Kredensial sementara tidak tersedia atau sudah digunakan');
    const password = this.temporaryCredentials.decrypt(target.temporaryCredential);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userTemporaryCredential.update({ where: { userId: id }, data: { lastRevealedAt: new Date(), revealCount: { increment: 1 } }, select: { revealCount: true } });
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'USER_TEMPORARY_CREDENTIAL_REVEAL', entity: 'User', entityId: id, reason, source: 'USER_MANAGEMENT', newValue: { purpose: target.temporaryCredential!.purpose, keyVersion: target.temporaryCredential!.keyVersion, revealCount: updated.revealCount } } });
    });
    return { password, purpose: target.temporaryCredential.purpose, createdAt: target.temporaryCredential.createdAt };
  }

  async remove(id: string, reason: string, actor: AuthenticatedUser) {
    const user = await this.findOne(id, actor);
    this.assertTargetManageable(user.role as Role, actor);
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

  async forceDelete(id: string, reason: string, actor: AuthenticatedUser) {
    if (actor.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Hanya System Admin yang dapat menghapus paksa user');
    }
    if (id === actor.userId) {
      throw new ForbiddenException('System Admin tidak dapat menghapus akun sendiri');
    }
    if (!reason.trim()) throw new BadRequestException('Alasan wajib diisi');

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: {
          id: true,
          employeeId: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });
      if (!user) throw new NotFoundException('User tidak ditemukan');

      await tx.coordinatorScope.deleteMany({ where: { coordinatorUserId: id } });
      await tx.employee.updateMany({ where: { coordinatorId: id }, data: { coordinatorId: null } });
      await tx.userTemporaryCredential.deleteMany({ where: { userId: id } });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          actorRole: Role.SYSTEM_ADMIN,
          action: 'USER_FORCE_DELETE',
          entity: 'User',
          entityId: id,
          oldValue: {
            ...user,
            lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
            createdAt: user.createdAt.toISOString(),
          },
          reason: reason.trim(),
          source: 'USER_MANAGEMENT',
          relatedEntityId: user.employeeId,
        },
      });
      await tx.user.delete({ where: { id } });
      return { deleted: true };
    });
  }

  private async assertEmployeeLinkAvailable(employeeId?: string, currentUserId?: string) {
    if (!employeeId) return;
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true, user: { select: { id: true } } } });
    if (!employee) throw new NotFoundException('Data karyawan untuk tautan akun tidak ditemukan');
    if (employee.user && employee.user.id !== currentUserId) throw new ConflictException('Karyawan ini sudah terhubung ke User lain');
  }

  private assertCredentialTarget(id: string, role: Role, actor: AuthenticatedUser) {
    if (id === actor.userId) throw new ForbiddenException('Gunakan pengaturan akun untuk mengubah password sendiri');
    this.assertTargetManageable(role, actor);
    if (actor.role === Role.ADMIN_HR && (role === Role.ADMIN_HR || role === Role.SYSTEM_ADMIN)) {
      throw new ForbiddenException('Admin HR tidak dapat mengelola kredensial akun admin');
    }
  }

  private async reauthenticate(actorId: string, currentPassword: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { passwordHash: true, isActive: true } });
    if (!actor?.isActive || !(await bcrypt.compare(currentPassword, actor.passwordHash))) {
      throw new UnauthorizedException('Password admin saat ini tidak valid');
    }
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }
}
