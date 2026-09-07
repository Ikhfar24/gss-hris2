import { Body, Controller, Delete, Get, Param, Post, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { QueryAttendanceDto, QueryOpenAttendanceDto } from './dto/query-attendance.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { ResetDeviceDto } from './dto/reset-device.dto';
import { ReviewAttendanceDto } from './dto/review-attendance.dto';
import { AutoCloseAttendanceDto } from './dto/auto-close-attendance.dto';

const REVIEWER_ROLES = [Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.KOORDINATOR, Role.DIREKTUR];
const ATTENDANCE_REVIEWER_ROLES = [Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.KOORDINATOR];
const HR_ROLES = [Role.ADMIN_HR, Role.SYSTEM_ADMIN];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private service: AttendanceService) {}

  // Self-service — any logged-in employee account can check in/out for
  // themselves. Not role-restricted beyond "must be authenticated": the
  // service resolves the employee from the token, so a Koordinator or HR
  // staffer who is themselves an employee can also use this.
  @Post('check-in')
  checkIn(@Body() dto: CheckInDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.checkIn(dto, actor);
  }

  @Patch('check-out')
  checkOut(@Body() dto: CheckOutDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.checkOut(dto, actor);
  }

  @Get('me/today')
  myToday(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.myToday(actor);
  }

  @Get('me/history')
  myHistory(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.myHistory(actor);
  }

  // Keep static paths before the ':id' detail route below.
  @Roles(...REVIEWER_ROLES)
  @Get('open')
  findOpen(@Query() query: QueryOpenAttendanceDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findOpen(query, actor);
  }

  @Roles(...ATTENDANCE_REVIEWER_ROLES)
  @Get('attention')
  attention(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.attention(actor);
  }

  @Roles(...REVIEWER_ROLES)
  @Get('summary')
  summary(@Query('date') date: string | undefined, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.summary(date, actor);
  }

  @Roles(...HR_ROLES)
  @Get('devices')
  listDevices() {
    return this.service.listDevices();
  }

  @Roles(...HR_ROLES)
  @Delete('devices/:employeeId')
  resetDevice(
    @Param('employeeId') employeeId: string,
    @Body() dto: ResetDeviceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.resetDevice(employeeId, dto, actor);
  }

  @Roles(...HR_ROLES)
  @Patch(':id/correct')
  correct(
    @Param('id') id: string,
    @Body() dto: CorrectAttendanceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.correct(id, dto, actor);
  }

  @Roles(...ATTENDANCE_REVIEWER_ROLES)
  @Post(':id/review')
  review(
    @Param('id') id: string,
    @Body() dto: ReviewAttendanceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.review(id, dto, actor);
  }

  @Roles(...HR_ROLES)
  @Post(':id/auto-close')
  autoCloseForgottenCheckout(@Param('id') id: string, @Body() dto: AutoCloseAttendanceDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.autoCloseForgottenCheckout(id, dto.reason, actor);
  }

  @Roles(...ATTENDANCE_REVIEWER_ROLES)
  @Get(':id/reviews')
  reviewHistory(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.reviewHistory(id, actor);
  }

  @Roles(...REVIEWER_ROLES)
  @Get()
  findAll(@Query() query: QueryAttendanceDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findAll(query, actor);
  }

  @Get(':id')
  findDetail(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findDetail(id, actor);
  }
}
