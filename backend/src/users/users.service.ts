import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SAFE_SELECT = {
  id: true,
  employeeId: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async findAll() {
    return this.prisma.user.findMany({ select: SAFE_SELECT, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE_SELECT });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    return user;
  }

  async create(dto: CreateUserDto, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email sudah terdaftar');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          role: dto.role,
          employeeId: dto.employeeId,
        },
        select: SAFE_SELECT,
      });
      await tx.auditLog.create({
        data: { actorId, action: 'USER_CREATE', entity: 'User', entityId: user.id, newValue: user as any },
      });
      return user;
    });
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const before = await this.findOne(id);

    const isSensitiveChange =
      (dto.role !== undefined && dto.role !== before.role) ||
      (dto.isActive !== undefined && dto.isActive !== before.isActive);

    if (dto.isActive === true) {
      const linked = await this.prisma.user.findUnique({
        where: { id },
        include: { employee: { select: { status: true } } },
      });
      if (linked?.employee?.status === 'RESIGNED') {
        throw new BadRequestException('Akun karyawan yang telah mengundurkan diri tidak dapat diaktifkan kembali tanpa proses status kerja baru');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { name: dto.name, role: dto.role, isActive: dto.isActive },
        select: SAFE_SELECT,
      });
      await tx.auditLog.create({
        data: isSensitiveChange
          ? {
              actorId, action: 'USER_UPDATE_SENSITIVE', entity: 'User', entityId: id,
              oldValue: { role: before.role, isActive: before.isActive },
              newValue: { role: updated.role, isActive: updated.isActive }, reason: dto.reason ?? null,
            }
          : { actorId, action: 'USER_UPDATE', entity: 'User', entityId: id, oldValue: before as any, newValue: updated as any },
      });
      return updated;
    });
  }

  /** Soft-deactivate rather than hard delete — operational data must stay traceable (PRD section 24). */
  async deactivate(id: string, actorId: string, reason?: string) {
    return this.update(id, { isActive: false, reason }, actorId);
  }
}
