import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdjustLeaveBalanceDto } from './dto/adjust-leave-balance.dto';
import { InitializeLeaveBalanceDto } from './dto/initialize-leave-balance.dto';
import { LeaveRequestsService } from './leave-requests.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave-balances')
export class LeaveBalancesController {
  constructor(private service: LeaveRequestsService) {}

  @Get('me')
  findMine(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.findMyLeaveBalances(actor);
  }

  @Roles(Role.ADMIN_HR)
  @Get('employees/:employeeId')
  findEmployee(@Param('employeeId') employeeId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findEmployeeLeaveBalances(employeeId, actor);
  }

  @Roles(Role.ADMIN_HR)
  @Post('employees/:employeeId/initialize')
  initialize(
    @Param('employeeId') employeeId: string,
    @Body() dto: InitializeLeaveBalanceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.initializeLeaveBalance(employeeId, dto, actor);
  }

  @Roles(Role.ADMIN_HR)
  @Patch('employees/:employeeId/adjust')
  adjust(
    @Param('employeeId') employeeId: string,
    @Body() dto: AdjustLeaveBalanceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.adjustLeaveBalance(employeeId, dto, actor);
  }
}
