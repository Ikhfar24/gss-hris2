import { Controller, Get, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ReportsService } from './reports.service';
import { ExportQueryDto } from './dto/export-query.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

// §16: reporting/export is an HR/management function, not self-service —
// same role set as the Phase 5 dashboard (Koordinator included since they
// reasonably need exports for their own team, scoping is a later
// refinement — see README "Keputusan Phase 5").
const REPORT_ROLES = [Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.DIREKTUR, Role.KOORDINATOR];

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...REPORT_ROLES)
@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('attendance')
  async attendance(@Query() query: ExportQueryDto, @CurrentUser() actor: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.service.exportAttendance(query, actor);
    return this.send(res, result);
  }

  @Get('placements')
  async placements(@Query() query: ExportQueryDto, @CurrentUser() actor: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.service.exportPlacements(query, actor);
    return this.send(res, result);
  }

  @Get('leave-requests')
  async leaveRequests(@Query() query: ExportQueryDto, @CurrentUser() actor: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.service.exportLeaveRequests(query, actor);
    return this.send(res, result);
  }

  private send(res: Response, result: { buffer: Buffer; filename: string; mime: string }) {
    res.set({
      'Content-Type': result.mime,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    });
    return new StreamableFile(result.buffer);
  }
}
