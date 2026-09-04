import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateLineItemDto } from './dto/create-line-item.dto';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { ReasonDto, RecordPaymentDto } from './dto/payroll-workflow.dto';
import { PayrollService } from './payroll.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payroll')
export class PayrollController {
  constructor(private service: PayrollService) {}

  @Roles(Role.KEUANGAN)
  @Post('runs')
  createRun(@Body() dto: CreatePayrollRunDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.createRun(dto, actor);
  }

  @Roles(Role.KEUANGAN, Role.ADMIN_HR)
  @Get('runs')
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.findAll(actor);
  }

  @Roles(Role.KEUANGAN, Role.ADMIN_HR)
  @Get('runs/:id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findOne(id, actor);
  }

  @Roles(Role.KEUANGAN)
  @Patch('runs/:id/review')
  review(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.review(id, actor);
  }

  @Roles(Role.KEUANGAN)
  @Patch('runs/:id/submit')
  submit(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.submit(id, dto, actor);
  }

  @Roles(Role.DIREKTUR)
  @Patch('runs/:id/approve')
  approve(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.directorDecision(id, true, dto, actor);
  }

  @Roles(Role.DIREKTUR)
  @Patch('runs/:id/reject')
  reject(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.directorDecision(id, false, dto, actor);
  }

  @Roles(Role.KEUANGAN)
  @Post('runs/:id/payments')
  payment(@Param('id') id: string, @Body() dto: RecordPaymentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.recordPayment(id, dto, actor);
  }

  @Roles(Role.KEUANGAN)
  @Post('slips/:slipId/items')
  addItem(@Param('slipId') slipId: string, @Body() dto: CreateLineItemDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.addLineItem(slipId, dto, actor);
  }

  @Roles(Role.KEUANGAN)
  @Delete('slips/:slipId/items/:itemId')
  removeItem(@Param('slipId') slipId: string, @Param('itemId') itemId: string, @Body() dto: ReasonDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.removeLineItem(slipId, itemId, dto, actor);
  }

  @Roles(Role.KEUANGAN)
  @Get('runs/:id/export')
  async exportRun(@Param('id') id: string, @Query('format') format: 'xlsx' | 'pdf' = 'xlsx', @CurrentUser() actor: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.service.exportRun(id, format === 'pdf' ? 'pdf' : 'xlsx', actor);
    res.set({ 'Content-Type': result.mime, 'Content-Disposition': `attachment; filename="${result.filename}"` });
    return new StreamableFile(result.buffer);
  }

  @Get('slips/:slipId/export')
  async exportSlip(@Param('slipId') id: string, @CurrentUser() actor: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.service.exportSlip(id, actor);
    res.set({ 'Content-Type': result.mime, 'Content-Disposition': `attachment; filename="${result.filename}"` });
    return new StreamableFile(result.buffer);
  }

  @Get('my-slips')
  findMySlips(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.findMySlips(actor);
  }
}
