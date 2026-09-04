import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ActionTemporaryAssignmentDto } from './dto/action-temporary-assignment.dto';
import { CreateTemporaryAssignmentDto } from './dto/create-temporary-assignment.dto';
import { ReviewTemporaryAssignmentDto } from './dto/review-temporary-assignment.dto';
import { UpdateTemporaryAssignmentDto } from './dto/update-temporary-assignment.dto';
import { TemporaryAssignmentsService } from './temporary-assignments.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('temporary-assignments')
export class TemporaryAssignmentsController {
  constructor(private service: TemporaryAssignmentsService) {}

  @Roles(Role.KOORDINATOR, Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Get() findAll(@CurrentUser() actor: AuthenticatedUser) { return this.service.findAll(actor); }

  @Roles(Role.KOORDINATOR, Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Get(':id') findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.service.findOne(id, actor); }

  @Roles(Role.KOORDINATOR, Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Post() create(@Body() dto: CreateTemporaryAssignmentDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.create(dto, actor); }

  @Roles(Role.KOORDINATOR, Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateTemporaryAssignmentDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.update(id, dto, actor); }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id/review') review(@Param('id') id: string, @Body() dto: ReviewTemporaryAssignmentDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.review(id, dto, actor); }

  @Roles(Role.KOORDINATOR, Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id/cancel') cancel(@Param('id') id: string, @Body() dto: ActionTemporaryAssignmentDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.cancel(id, dto, actor); }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id/complete') complete(@Param('id') id: string, @Body() dto: ActionTemporaryAssignmentDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.complete(id, dto, actor); }
}
