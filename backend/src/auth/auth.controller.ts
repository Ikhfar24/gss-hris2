import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Rate-limited: login is a sensitive endpoint (brute-force target).
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(AuthGuard('local'))
  @Post('login')
  async login(@Body() _dto: LoginDto, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    // req.user populated by LocalStrategy after validating credentials
    const session = await this.authService.login(req.user);
    res.cookie('papaiz_access_token', session.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: session.maxAgeMs,
    });
    return { user: session.user };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@CurrentUser() actor: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    res.clearCookie('papaiz_access_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
    await this.authService.logout(actor.userId);
    return { loggedOut: true };
  }
}
