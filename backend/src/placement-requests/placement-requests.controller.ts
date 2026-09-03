import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { PlacementRequestsService } from './placement-requests.service';
import { CreatePlacementRequestDto } from './dto/create-placement-request.dto';
import { ReviewPlacementRequestDto } from './dto/review-placement-request.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('placement-requests')
export class PlacementRequestsController {
  constructor(private service: PlacementRequestsService) {}

  @Roles(Role.KOORDINATOR, Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.DIREKTUR)
  @Get()
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.findAll(actor);
  }

  @Roles(Role.KOORDINATOR, Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.DIREKTUR)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findOne(id, actor);
  }

  // §10.2 BR-005: Koordinator submits, cannot approve their own submission.
  @Roles(Role.KOORDINATOR, Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Post()
  create(@Body() dto: CreatePlacementRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id/hr-review')
  hrReview(
    @Param('id') id: string,
    @Body() dto: ReviewPlacementRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.hrReview(id, dto, actor);
  }

  @Roles(Role.DIREKTUR, Role.SYSTEM_ADMIN)
  @Patch(':id/director-approve')
  directorApprove(
    @Param('id') id: string,
    @Body() dto: ReviewPlacementRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.directorApprove(id, dto, actor);
  }

  @Roles(Role.KOORDINATOR, Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.cancel(id, actor);
  }
}
