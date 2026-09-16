import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { firstValueFrom, isObservable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext) {
    const result = super.canActivate(context);
    const authenticated = isObservable(result) ? await firstValueFrom(result) : await result;
    const request = context.switchToHttp().getRequest();
    const allowedDuringPasswordChange = ['/auth/me', '/auth/account/password', '/auth/logout'];
    if (request.user?.mustChangePassword && !allowedDuringPasswordChange.some((path) => request.path?.endsWith(path))) {
      throw new ForbiddenException('Password sementara harus diganti sebelum menggunakan fitur lain');
    }
    return authenticated;
  }
}
