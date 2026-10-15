import { BadRequestException, ConflictException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { Prisma } from '@prisma/client';
import { ChangeEmailDto, ChangePasswordDto } from './dto/account.dto';
import { TemporaryCredentialService } from '../temporary-credentials/temporary-credential.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private auditLog: AuditLogService,
    @Optional() private temporaryCredentials?: TemporaryCredentialService,
  ) {}

  async validateUser(email: string, password: string) {
    const normalizedEmail = this.normalizeEmail(email);
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      include: { temporaryCredential: { select: { createdAt: true } } },
    });
    if (!user) {
      await this.auditLog?.record?.({
        action: 'AUTH_LOGIN_FAILED',
        entity: 'User',
        source: 'AUTH_LOCAL',
        reason: `Akun tidak ditemukan untuk email: ${normalizedEmail}`,
      });
      return null;
    }
    if (!user.isActive) {
      await this.auditLog?.record?.({
        actorId: user.id,
        actorName: user.name,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'AUTH_LOGIN_FAILED',
        entity: 'User',
        entityId: user.id,
        source: 'AUTH_LOCAL',
        reason: 'Akun nonaktif',
      });
      return null;
    }
    if (user.mustChangePassword && user.temporaryCredential && this.temporaryCredentials?.isExpired(user.temporaryCredential.createdAt)) {
      await this.auditLog?.record?.({
        actorId: user.id,
        actorName: user.name,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'AUTH_LOGIN_FAILED',
        entity: 'User',
        entityId: user.id,
        source: 'AUTH_LOCAL',
        reason: 'Kredensial sementara kedaluwarsa',
      });
      return null;
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      await this.auditLog?.record?.({
        actorId: user.id,
        actorName: user.name,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'AUTH_LOGIN_FAILED',
        entity: 'User',
        entityId: user.id,
        source: 'AUTH_LOCAL',
        reason: 'Password tidak sesuai',
      });
      return null;
    }

    const { passwordHash, temporaryCredential: _temporaryCredential, ...safeUser } = user;
    void _temporaryCredential;
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

  async generateRefreshToken(userId: string, sessionVersion?: number): Promise<string> {
    let version = sessionVersion;
    if (version === undefined) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { sessionVersion: true },
      });
      if (!user) {
        throw new UnauthorizedException('Pengguna tidak ditemukan');
      }
      version = user.sessionVersion;
    }

    const payload = {
      sub: userId,
      type: 'refresh',
      sessionVersion: version,
    };

    return this.jwt.sign(payload, { expiresIn: '7d' });
  }

  async login(user: { id: string; name?: string; email: string; role: string; mustChangePassword: boolean; sessionVersion: number }) {
    const payload = { sub: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword, sessionVersion: user.sessionVersion };
    const accessToken = this.jwt.sign(payload);
    const refreshToken = await this.generateRefreshToken(user.id, user.sessionVersion);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorName: (user as any).name ?? null,
          actorEmail: user.email,
          actorRole: user.role as Role,
          action: 'AUTH_LOGIN',
          entity: 'User',
          entityId: user.id,
        },
      });
    });

    return {
      accessToken,
      refreshToken,
      maxAgeMs: 8 * 60 * 60 * 1000,
      refreshMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
      user: { id: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword },
    };
  }

  async refreshAccessToken(refreshToken: string) {
    let payload: { sub?: string; type?: string; sessionVersion?: number };
    try {
      payload = this.jwt.verify(refreshToken);
    } catch {
      throw new UnauthorizedException('Token refresh tidak valid atau kedaluwarsa');
    }

    if (!payload || payload.type !== 'refresh' || !payload.sub) {
      throw new UnauthorizedException('Token refresh tidak valid');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        sessionVersion: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sesi tidak lagi aktif');
    }

    if (user.sessionVersion !== payload.sessionVersion) {
      throw new UnauthorizedException('Sesi telah kedaluwarsa atau diperbarui');
    }

    const newAccessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      sessionVersion: user.sessionVersion,
    });

    const newRefreshToken = await this.generateRefreshToken(user.id, user.sessionVersion);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      maxAgeMs: 8 * 60 * 60 * 1000,
      refreshMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async changePassword(actor: AuthenticatedUser, dto: ChangePasswordDto) {
    const user = await this.userForReauthentication(actor.userId, dto.currentPassword);
    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) throw new BadRequestException('Password baru harus berbeda dari password saat ini');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const updated = await this.prisma.$transaction(async (tx) => {
      const value = await tx.user.update({ where: { id: actor.userId }, data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } }, select: { id: true, email: true, role: true, mustChangePassword: true, sessionVersion: true } });
      await tx.userTemporaryCredential.deleteMany({ where: { userId: actor.userId } });
      await tx.auditLog.create({ data: { actorId: actor.userId, actorName: user.name, actorEmail: user.email, actorRole: user.role, action: 'AUTH_PASSWORD_CHANGE', entity: 'User', entityId: actor.userId, source: 'ACCOUNT_SELF_SERVICE', newValue: { mustChangePassword: false, sessionVersion: value.sessionVersion } } });
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
        await tx.auditLog.create({ data: { actorId: actor.userId, actorName: user.name, actorEmail: user.email, actorRole: user.role, action: 'AUTH_EMAIL_CHANGE', entity: 'User', entityId: actor.userId, source: 'ACCOUNT_SELF_SERVICE', oldValue: { email: user.email }, newValue: { email, sessionVersion: value.sessionVersion } } });
        return value;
      });
      return this.issueSession(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Email sudah terdaftar');
      throw error;
    }
  }

  private async userForReauthentication(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, passwordHash: true, role: true, isActive: true } });
    if (!user?.isActive || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException('Password saat ini tidak valid');
    return user;
  }

  private async issueSession(user: { id: string; email: string; role: string; mustChangePassword: boolean; sessionVersion: number }) {
    const refreshToken = await this.generateRefreshToken(user.id, user.sessionVersion);
    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword, sessionVersion: user.sessionVersion }),
      refreshToken,
      maxAgeMs: 8 * 60 * 60 * 1000,
      refreshMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
      user: { id: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword },
    };
  }

  private normalizeEmail(email: string) { return email.trim().toLowerCase(); }

  async logout(userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { sessionVersion: { increment: 1 } },
        select: { name: true, email: true, role: true, sessionVersion: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          actorName: user.name,
          actorEmail: user.email,
          actorRole: user.role,
          action: 'AUTH_LOGOUT',
          entity: 'User',
          entityId: userId,
          source: 'ACCOUNT_SELF_SERVICE',
          newValue: { sessionVersion: user.sessionVersion },
        },
      });
    });
  }
}
