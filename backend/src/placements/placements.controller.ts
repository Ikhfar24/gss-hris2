import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PlacementsService } from './placements.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('placements')
export class PlacementsController {
  constructor(private service: PlacementsService) {}

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.KOORDINATOR, Role.DIREKTUR, Role.KOMISARIS, Role.MARKETING)
  @Get('active')
  findAllActive(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.findAllActive(actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.KOORDINATOR, Role.DIREKTUR)
  @Get('employee/:employeeId')
  findByEmployee(@Param('employeeId') employeeId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findByEmployee(employeeId, actor);
  }
}
