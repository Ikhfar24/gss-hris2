import { Body, Controller, Delete, Get, Param, Patch, Post, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { RequiredReasonDto } from '../common/dto/required-reason.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(private service: ClientsService) {}

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.KOORDINATOR, Role.DIREKTUR)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Get('import/template')
  async importTemplate(@Res({ passthrough: true }) res: Response) {
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="clients-import-template.xlsx"' });
    return new StreamableFile(await this.service.importTemplate());
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importPreview(@UploadedFile() file: any) {
    return this.service.previewImport(file);
  }

  @Roles(Role.ADMIN_HR)
  @Post('import/commit')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importCommit(@UploadedFile() file: any, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.commitImport(file, actor);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.KOORDINATOR, Role.DIREKTUR)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles(Role.ADMIN_HR)
  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor);
  }

  @Roles(Role.ADMIN_HR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClientDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.update(id, dto, actor);
  }

  @Roles(Role.ADMIN_HR)
  @Delete(':id')
  remove(@Param('id') id: string, @Body() dto: RequiredReasonDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.remove(id, dto.reason, actor);
  }

  @Roles(Role.ADMIN_HR)
  @Delete(':id/force-delete')
  forceDelete(@Param('id') id: string, @Body() dto: RequiredReasonDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.forceDelete(id, dto.reason, actor);
  }
}
