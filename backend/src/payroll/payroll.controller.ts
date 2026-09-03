import { Body, Controller, Get, Param, Patch, Post, Delete, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { PayrollService } from './payroll.service';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { CreateLineItemDto } from './dto/create-line-item.dto';

const MANAGE = [Role.ADMIN_HR, Role.SYSTEM_ADMIN];
// Read-only reviewers per business decision: Keuangan/Direktur only ever
// see FINALIZED runs — the service enforces this, not just the guard here.
const ALL_VIEWERS = [Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.KEUANGAN, Role.DIREKTUR];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payroll')
export class PayrollController {
  constructor(private service: PayrollService) {}

  @Roles(...MANAGE)
  @Post('runs')
  createRun(@Body() dto: CreatePayrollRunDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.createRun(dto, actor);
  }

  @Roles(...ALL_VIEWERS)
  @Get('runs')
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.findAll(actor);
  }

  @Roles(...ALL_VIEWERS)
  @Get('runs/:id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findOne(id, actor);
  }

  @Roles(...MANAGE)
  @Patch('runs/:id/finalize')
  finalize(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.finalize(id, actor);
  }

  @Roles(...ALL_VIEWERS)
  @Get('runs/:id/export')
  async exportRun(
    @Param('id') id: string,
    @Query('format') format: 'xlsx' | 'pdf' = 'xlsx',
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.exportRun(id, format === 'pdf' ? 'pdf' : 'xlsx', actor);
    res.set({ 'Content-Type': result.mime, 'Content-Disposition': `attachment; filename="${result.filename}"` });
    return new StreamableFile(result.buffer);
  }

  @Roles(...MANAGE)
  @Post('slips/:slipId/items')
  addItem(@Param('slipId') slipId: string, @Body() dto: CreateLineItemDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.addLineItem(slipId, dto, actor);
  }

  @Roles(...MANAGE)
  @Delete('slips/:slipId/items/:itemId')
  removeItem(@Param('slipId') slipId: string, @Param('itemId') itemId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.removeLineItem(slipId, itemId, actor);
  }

  // No @Roles() — every authenticated role may reach this; the service
  // itself decides whether THIS slip belongs to THIS actor (owner) or a
  // reviewer role, and whether it's visible yet (FINALIZED-only for
  // non-managers). See PayrollService.exportSlip.
  @Get('slips/:slipId/export')
  async exportSlip(@Param('slipId') slipId: string, @CurrentUser() actor: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.service.exportSlip(slipId, actor);
    res.set({ 'Content-Type': result.mime, 'Content-Disposition': `attachment; filename="${result.filename}"` });
    return new StreamableFile(result.buffer);
  }

  // Karyawan self-service — own finalized slips only.
  @Get('my-slips')
  findMySlips(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.findMySlips(actor);
  }
}
