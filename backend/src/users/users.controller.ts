import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AdminResetPasswordDto, LifecycleDto } from './dto/lifecycle.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // Director may monitor, but normal HR account mutation remains HR/System Admin.
  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.DIREKTUR)
  @Get()
  findAll(@Query() query: any) {
    return this.usersService.findAll(query);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.DIREKTUR)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.create(dto, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.update(id, dto, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @Body() dto: LifecycleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.deactivate(id, dto.reason, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string, @Body() dto: LifecycleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.reactivate(id, dto.reason, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() dto: AdminResetPasswordDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.resetPassword(id, dto.password, dto.reason, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @Body() dto: LifecycleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.remove(id, dto.reason, actor);
  }
}
