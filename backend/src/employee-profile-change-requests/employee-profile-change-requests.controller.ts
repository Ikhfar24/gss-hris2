import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateProfileChangeRequestDto } from './dto/create-profile-change-request.dto';
import { ReviewProfileChangeRequestDto } from './dto/review-profile-change-request.dto';
import { EmployeeProfileChangeRequestsService } from './employee-profile-change-requests.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class EmployeeProfileChangeRequestsController {
  constructor(private service: EmployeeProfileChangeRequestsService) {}

  @Post('employees/me/profile-change-requests')
  create(@Body() dto: CreateProfileChangeRequestDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.create(dto, actor); }

  @Get('employees/me/profile-change-requests')
  mine(@CurrentUser() actor: AuthenticatedUser) { return this.service.findMine(actor); }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Get('employee-profile-change-requests')
  findAll(@Query('status') status?: string) { return this.service.findAll(status); }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch('employee-profile-change-requests/:id/review')
  review(@Param('id') id: string, @Body() dto: ReviewProfileChangeRequestDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.review(id, dto, actor); }
}
