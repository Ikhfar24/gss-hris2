import { Body, Controller, Get, Patch, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ChangeEmailDto, ChangePasswordDto } from './dto/account.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() actor: AuthenticatedUser) {
    return this.authService.me(actor);
  }

  // Rate-limited: login is a sensitive endpoint (brute-force target).
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(AuthGuard('local'))
  @Post('login')
  async login(@Body() _dto: LoginDto, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    // req.user populated by LocalStrategy after validating credentials
    const session = await this.authService.login(req.user);
    if (session.refreshToken) {
      this.setRefreshTokenCookie(res, session.refreshToken, session.refreshMaxAgeMs);
    }
    this.setSessionCookie(res, session);
    return { user: session.user };
  }

  @Post('refresh')
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.['papaiz_refresh_token'] ?? req.headers?.cookie?.match(/(?:^|; )papaiz_refresh_token=([^;]+)/)?.[1];
    if (!refreshToken) {
      throw new UnauthorizedException('Token refresh tidak ditemukan');
    }
    const session = await this.authService.refreshAccessToken(refreshToken);
    if (session.refreshToken) {
      this.setRefreshTokenCookie(res, session.refreshToken, session.refreshMaxAgeMs);
    }
    this.setSessionCookie(res, session);
    return { message: 'Token diperbarui' };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('account/password')
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() actor: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const session = await this.authService.changePassword(actor, dto);
    if (session.refreshToken) {
      this.setRefreshTokenCookie(res, session.refreshToken, session.refreshMaxAgeMs);
    }
    this.setSessionCookie(res, session);
    return { user: session.user };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('account/email')
  async changeEmail(@Body() dto: ChangeEmailDto, @CurrentUser() actor: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const session = await this.authService.changeEmail(actor, dto);
    if (session.refreshToken) {
      this.setRefreshTokenCookie(res, session.refreshToken, session.refreshMaxAgeMs);
    }
    this.setSessionCookie(res, session);
    return { user: session.user };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@CurrentUser() actor: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    res.clearCookie('papaiz_access_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
    this.clearRefreshTokenCookie(res);
    await this.authService.logout(actor.userId);
    return { loggedOut: true };
  }

  private setSessionCookie(res: Response, session: { accessToken: string; maxAgeMs: number }) {
    res.cookie('papaiz_access_token', session.accessToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: session.maxAgeMs });
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    res.cookie('papaiz_refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth/refresh',
      maxAge: maxAgeMs,
    });
  }

  private clearRefreshTokenCookie(res: Response) {
    res.clearCookie('papaiz_refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth/refresh',
    });
  }
}
