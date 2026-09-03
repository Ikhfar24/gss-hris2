import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { LeaveRequestsService } from './leave-requests.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ReviewLeaveRequestDto } from './dto/review-leave-request.dto';

// Every authenticated role can reach this controller — visibility is
// scoped inside the service itself (Karyawan sees only their own,
// Koordinator sees their team, HR/Direktur/System Admin see everything).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave-requests')
export class LeaveRequestsController {
  constructor(private service: LeaveRequestsService) {}

  @Get()
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.findAll(actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findOne(id, actor);
  }

  @Post()
  create(@Body() dto: CreateLeaveRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor);
  }

  // §13: single-step Admin/HR approval (MVP default — see README "Keputusan
  // Phase 4"). Koordinator is deliberately NOT given approval rights here,
  // consistent with BR-005's placement precedent (field staff propose,
  // HR/SDM decides).
  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Body() dto: ReviewLeaveRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.review(id, dto, actor);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.cancel(id, actor);
  }
}
