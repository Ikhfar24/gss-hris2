import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.KOORDINATOR, Role.DIREKTUR, Role.KOMISARIS)
  @Get('summary')
  summary(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.summary(actor);
  }
}
