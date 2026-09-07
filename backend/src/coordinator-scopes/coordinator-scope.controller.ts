import { BadRequestException, Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { EmploymentType } from '@prisma/client';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CoordinatorScopeService } from './coordinator-scope.service';

class SetCoordinatorScopeDto { @IsBoolean() active: boolean; }

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
@Controller('coordinator-scopes')
export class CoordinatorScopeController {
  constructor(private scopes: CoordinatorScopeService) {}
  @Get() list() { return this.scopes.list(); }
  @Patch(':userId/:employmentType')
  set(@Param('userId') userId: string, @Param('employmentType') employmentType: EmploymentType, @Body() dto: SetCoordinatorScopeDto, @CurrentUser() actor: AuthenticatedUser) { if (!Object.values(EmploymentType).includes(employmentType)) throw new BadRequestException('employmentType tidak valid'); return this.scopes.set(userId, employmentType, dto.active, actor); }
}
