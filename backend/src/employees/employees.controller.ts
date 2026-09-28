import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { LifecycleDto } from '../users/dto/lifecycle.dto';
import { BulkDeactivateEmployeesDto, ImportEmployeesDto } from './dto/batch7-employees.dto';
import { ForceDeleteEmployeeDto } from './dto/force-delete-employee.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private service: EmployeesService) {}

  // Koordinator/Direktur read for monitoring (§9.2/§9.6); self-service
  // profile routes are declared separately below.
  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.KOORDINATOR, Role.DIREKTUR, Role.KOMISARIS)
  @Get()
  findAll(@CurrentUser() actor: AuthenticatedUser, @Query() query: any) {
    return this.service.findAll(actor, query);
  }

  @Roles(Role.MARKETING, Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.DIREKTUR, Role.KOMISARIS)
  @Get('manpower')
  manpower() { return this.service.manpower(); }

  // Self-service profile — must be declared before ':id' so "me" isn't
  // captured as an id param. No @Roles: any authenticated account can call
  // this; the service scopes it to the caller's own linked Employee record.
  @Get('me')
  findMe(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.findByUserId(actor.userId);
  }

  @Get('me/360')
  findMy360(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.find360ByUserId(actor.userId);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.KOORDINATOR, Role.DIREKTUR, Role.KOMISARIS, Role.MARKETING, Role.KARYAWAN)
  @Get('export')
  async export(@Query('format') format: 'xlsx' | 'pdf' = 'xlsx', @CurrentUser() actor: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.service.export(format === 'pdf' ? 'pdf' : 'xlsx', actor);
    res.set({ 'Content-Type': result.mime, 'Content-Disposition': `attachment; filename="${result.filename}"` });
    return new StreamableFile(result.buffer);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Post('import')
  import(@Body() dto: ImportEmployeesDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.import(dto, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Get('import/template')
  async importTemplate(@Res({ passthrough: true }) res: Response) {
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="employees-import-template.xlsx"' });
    return new StreamableFile(await this.service.importTemplate());
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1, fieldNameSize: 100 } }))
  importPreview(@UploadedFile() file: any) {
    return this.service.previewXlsxImport(file);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('import/commit')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1, fieldNameSize: 100 } }))
  importCommit(@UploadedFile() file: any, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.commitXlsxImport(file, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch('bulk-deactivate')
  bulkDeactivate(@Body() dto: BulkDeactivateEmployeesDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.bulkDeactivate(dto, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.KOORDINATOR, Role.DIREKTUR, Role.KOMISARIS, Role.KARYAWAN)
  @Get(':id/360')
  find360(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.find360(id, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.KOORDINATOR, Role.DIREKTUR, Role.KOMISARIS)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findOne(id, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Post()
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.update(id, dto, actor);
  }

  @Roles(Role.ADMIN_HR)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post(':id/profile-photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1, fieldNameSize: 100 } }))
  updateProfilePhoto(@Param('id') id: string, @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.updateProfilePhoto(id, file, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @Body() dto: LifecycleDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.deactivate(id, dto.reason, actor); }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string, @Body() dto: LifecycleDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.reactivate(id, dto.reason, actor); }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Post(':id/force-delete')
  forceDelete(@Param('id') id: string, @Body() dto: ForceDeleteEmployeeDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.forceDelete(id, dto.reason, dto.confirmation, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @Body() dto: LifecycleDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.remove(id, dto.reason, actor); }
}
