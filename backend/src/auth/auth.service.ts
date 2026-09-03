import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private auditLog: AuditLogService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return null;

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) return null;

    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  async login(user: { id: string; email: string; role: string }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwt.sign(payload);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: user.id, action: 'AUTH_LOGIN', entity: 'User', entityId: user.id } });
    });

    return {
      accessToken,
      maxAgeMs: 8 * 60 * 60 * 1000,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async logout(userId: string) {
    await this.auditLog.record({
      actorId: userId,
      action: 'AUTH_LOGOUT',
      entity: 'User',
      entityId: userId,
    });
  }
}
