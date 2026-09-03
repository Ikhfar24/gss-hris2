import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private service: EmployeesService) {}

  // Koordinator/Direktur read for monitoring (§9.2/§9.6); Karyawan's own
  // profile is served separately (not implemented here — Phase 4/5 concern
  // once self-service "my profile" endpoints are scoped).
  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.KOORDINATOR, Role.DIREKTUR)
  @Get()
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.findAll(actor);
  }

  // Self-service profile — must be declared before ':id' so "me" isn't
  // captured as an id param. No @Roles: any authenticated account can call
  // this; the service scopes it to the caller's own linked Employee record.
  @Get('me')
  findMe(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.findByUserId(actor.userId);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.KOORDINATOR, Role.DIREKTUR)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findOne(id, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Post()
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor.userId);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.update(id, dto, actor.userId);
  }
}
