import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateOvertimeRequestDto } from './dto/create-overtime-request.dto';
import { ReviewOvertimeRequestDto } from './dto/review-overtime-request.dto';
import { OvertimeRequestsService } from './overtime-requests.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('overtime-requests')
export class OvertimeRequestsController {
  constructor(private service: OvertimeRequestsService) {}

  @Roles(Role.KARYAWAN, Role.KOORDINATOR, Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Get()
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.findAll(actor);
  }

  @Roles(Role.KARYAWAN, Role.KOORDINATOR, Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findOne(id, actor);
  }

  @Roles(Role.KARYAWAN, Role.KOORDINATOR)
  @Post()
  create(@Body() dto: CreateOvertimeRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor);
  }

  @Roles(Role.KOORDINATOR, Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id/review')
  review(@Param('id') id: string, @Body() dto: ReviewOvertimeRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.review(id, dto, actor);
  }

  @Roles(Role.KARYAWAN, Role.KOORDINATOR, Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.cancel(id, actor);
  }
}
