import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type?: string;
  mustChangePassword?: boolean;
  sessionVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private prisma: PrismaService) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET wajib diatur dan minimal 32 karakter.');
    }
    super({
      // Bearer tokens remain accepted during the client transition. New
      // browser sessions use the HttpOnly cookie set by AuthController.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request) => request?.headers?.cookie?.match(/(?:^|; )papaiz_access_token=([^;]+)/)?.[1] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type === 'refresh') {
      throw new UnauthorizedException('Token refresh tidak dapat digunakan sebagai token akses');
    }
    // Token claims are never authoritative for current access. This closes
    // the window where a deactivated user or demoted admin keeps old rights.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true, sessionVersion: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Sesi tidak lagi aktif');
    if (user.sessionVersion !== payload.sessionVersion) throw new UnauthorizedException('Sesi telah diperbarui');
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      ...(user.name !== undefined ? { name: user.name } : {}),
      ...(user.mustChangePassword !== undefined ? { mustChangePassword: user.mustChangePassword } : {}),
      ...(user.sessionVersion !== undefined ? { sessionVersion: user.sessionVersion } : {}),
    };
  }
}
