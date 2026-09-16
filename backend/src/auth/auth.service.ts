import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { Prisma } from '@prisma/client';
import { ChangeEmailDto, ChangePasswordDto } from './dto/account.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private auditLog: AuditLogService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findFirst({ where: { email: { equals: this.normalizeEmail(email), mode: 'insensitive' } } });
    if (!user || !user.isActive) return null;

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) return null;

    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  async me(actor: AuthenticatedUser) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        employee: {
          select: {
            id: true,
            name: true,
            photoUrl: true,
            jobTitle: true,
            employmentType: true,
            status: true,
            attendanceRequired: true,
            placements: {
              where: {
                status: { in: ['ACTIVE', 'SCHEDULED'] },
                startDate: { lte: today },
                OR: [{ endDate: null }, { endDate: { gte: today } }],
              },
              orderBy: { startDate: 'desc' },
              take: 1,
              select: { location: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Sesi tidak lagi aktif');

    const employee = user.employee
      ? {
          id: user.employee.id,
          name: user.employee.name,
          photoUrl: user.employee.photoUrl,
          jobTitle: user.employee.jobTitle,
          employmentType: user.employee.employmentType,
          status: user.employee.status,
          attendanceRequired: user.employee.attendanceRequired,
          activePlacementName: user.employee.placements[0]?.location.name ?? null,
        }
      : null;

    const coordinatorScopeTypes = user.role === Role.KOORDINATOR
      ? (await this.prisma.coordinatorScope.findMany({ where: { coordinatorUserId: user.id, active: true }, select: { employmentType: true }, orderBy: { employmentType: 'asc' } })).map((scope) => scope.employmentType)
      : [];

    return { id: user.id, email: user.email, role: user.role, employee, coordinatorScopeTypes, ...(user.mustChangePassword !== undefined ? { mustChangePassword: user.mustChangePassword } : {}) };
  }

  async login(user: { id: string; email: string; role: string; mustChangePassword: boolean; sessionVersion: number }) {
    const payload = { sub: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword, sessionVersion: user.sessionVersion };
    const accessToken = this.jwt.sign(payload);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: user.id, action: 'AUTH_LOGIN', entity: 'User', entityId: user.id } });
    });

    return {
      accessToken,
      maxAgeMs: 8 * 60 * 60 * 1000,
      user: { id: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword },
    };
  }

  async changePassword(actor: AuthenticatedUser, dto: ChangePasswordDto) {
    const user = await this.userForReauthentication(actor.userId, dto.currentPassword);
    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) throw new BadRequestException('Password baru harus berbeda dari password saat ini');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const updated = await this.prisma.$transaction(async (tx) => {
      const value = await tx.user.update({ where: { id: actor.userId }, data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } }, select: { id: true, email: true, role: true, mustChangePassword: true, sessionVersion: true } });
      await tx.userTemporaryCredential.deleteMany({ where: { userId: actor.userId } });
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: user.role, action: 'AUTH_PASSWORD_CHANGE', entity: 'User', entityId: actor.userId, source: 'ACCOUNT_SELF_SERVICE', newValue: { mustChangePassword: false, sessionVersion: value.sessionVersion } } });
      return value;
    });
    return this.issueSession(updated);
  }

  async changeEmail(actor: AuthenticatedUser, dto: ChangeEmailDto) {
    const user = await this.userForReauthentication(actor.userId, dto.currentPassword);
    const email = this.normalizeEmail(dto.email);
    if (email === user.email) throw new BadRequestException('Email baru sama dengan email saat ini');
    const duplicate = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, id: { not: actor.userId } }, select: { id: true } });
    if (duplicate) throw new ConflictException('Email sudah terdaftar');
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const value = await tx.user.update({ where: { id: actor.userId }, data: { email, sessionVersion: { increment: 1 } }, select: { id: true, email: true, role: true, mustChangePassword: true, sessionVersion: true } });
        await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: user.role, action: 'AUTH_EMAIL_CHANGE', entity: 'User', entityId: actor.userId, source: 'ACCOUNT_SELF_SERVICE', oldValue: { email: user.email }, newValue: { email, sessionVersion: value.sessionVersion } } });
        return value;
      });
      return this.issueSession(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Email sudah terdaftar');
      throw error;
    }
  }

  private async userForReauthentication(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, passwordHash: true, role: true, isActive: true } });
    if (!user?.isActive || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException('Password saat ini tidak valid');
    return user;
  }

  private issueSession(user: { id: string; email: string; role: string; mustChangePassword: boolean; sessionVersion: number }) {
    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword, sessionVersion: user.sessionVersion }),
      maxAgeMs: 8 * 60 * 60 * 1000,
      user: { id: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword },
    };
  }

  private normalizeEmail(email: string) { return email.trim().toLowerCase(); }

  async logout(userId: string) {
    await this.auditLog.record({
      actorId: userId,
      action: 'AUTH_LOGOUT',
      entity: 'User',
      entityId: userId,
    });
  }
}
