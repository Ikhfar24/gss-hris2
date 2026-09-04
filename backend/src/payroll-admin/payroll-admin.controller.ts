import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreatePayrollCycleSettingDto, CreatePayrollPeriodDto, CreatePayrollRevisionDto, RevisionActionDto, UpdatePayrollCycleSettingDto } from './dto/payroll-admin.dto';
import { PayrollAdminService } from './payroll-admin.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payroll-admin')
export class PayrollAdminController {
  constructor(private service: PayrollAdminService) {}

  @Roles(Role.KEUANGAN) @Get('cycle-settings') listCycleSettings() { return this.service.listCycleSettings(); }
  @Roles(Role.KEUANGAN) @Post('cycle-settings') createCycleSetting(@Body() dto: CreatePayrollCycleSettingDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.createCycleSetting(dto, actor); }
  @Roles(Role.KEUANGAN) @Patch('cycle-settings/:id') updateCycleSetting(@Param('id') id: string, @Body() dto: UpdatePayrollCycleSettingDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.updateCycleSetting(id, dto, actor); }

  @Roles(Role.KEUANGAN) @Get('periods') listPeriods(@Query('cycleSettingId') cycleSettingId?: string) { return this.service.listPeriods(cycleSettingId); }
  @Roles(Role.KEUANGAN) @Post('periods') createPeriod(@Body() dto: CreatePayrollPeriodDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.createPeriod(dto, actor); }
  @Roles(Role.KEUANGAN) @Patch('periods/:id/close') closePeriod(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.service.closePeriod(id, actor); }
  @Roles(Role.KEUANGAN) @Patch('periods/:id/reopen') reopenPeriod(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.service.reopenPeriod(id, actor); }

  @Roles(Role.KEUANGAN, Role.DIREKTUR) @Get('revisions') listRevisions(@Query('payrollRunId') payrollRunId?: string) { return this.service.listRevisions(payrollRunId); }
  @Roles(Role.KEUANGAN, Role.DIREKTUR) @Get('revisions/:id') getRevision(@Param('id') id: string) { return this.service.getRevision(id); }
  @Roles(Role.KEUANGAN) @Post('runs/:payrollRunId/revisions') createRevision(@Param('payrollRunId') payrollRunId: string, @Body() dto: CreatePayrollRevisionDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.createRevision(payrollRunId, dto, actor); }
  @Roles(Role.KEUANGAN) @Patch('revisions/:id/submit') submitRevision(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.service.submitRevision(id, actor); }
  @Roles(Role.DIREKTUR) @Patch('revisions/:id/approve') approveRevision(@Param('id') id: string, @Body() dto: RevisionActionDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.approveRevision(id, dto, actor); }
  @Roles(Role.DIREKTUR) @Patch('revisions/:id/reject') rejectRevision(@Param('id') id: string, @Body() dto: RevisionActionDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.rejectRevision(id, dto, actor); }
  @Roles(Role.KEUANGAN) @Patch('revisions/:id/finalize') finalizeRevision(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.service.finalizeRevision(id, actor); }
}
