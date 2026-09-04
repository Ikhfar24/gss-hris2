import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { AbsenceCasesService } from './absence-cases.service';
import { CreateAbsenceCaseDto } from './dto/create-absence-case.dto';
import { SubmitAbsenceExplanationDto } from './dto/submit-absence-explanation.dto';
import { FollowUpAbsenceCaseDto } from './dto/follow-up-absence-case.dto';
import { ResolveAbsenceCaseDto } from './dto/resolve-absence-case.dto';
import { QueryAbsenceAttentionDto } from './dto/query-absence-attention.dto';

const HR_ROLES = [Role.ADMIN_HR, Role.SYSTEM_ADMIN];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('absence-cases')
export class AbsenceCasesController {
  constructor(private service: AbsenceCasesService) {}

  @Roles(...HR_ROLES)
  @Post()
  create(@Body() dto: CreateAbsenceCaseDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor);
  }

  @Roles(Role.KOORDINATOR, ...HR_ROLES)
  @Get('attention')
  attention(@Query() query: QueryAbsenceAttentionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.attention(query, actor);
  }

  @Get('my')
  findMy(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.findMy(actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findOne(id, actor);
  }

  @Patch(':id/explanation')
  submitExplanation(@Param('id') id: string, @Body() dto: SubmitAbsenceExplanationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.submitExplanation(id, dto, actor);
  }

  @Roles(Role.KOORDINATOR, ...HR_ROLES)
  @Patch(':id/follow-up')
  followUp(@Param('id') id: string, @Body() dto: FollowUpAbsenceCaseDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.followUp(id, dto, actor);
  }

  @Roles(...HR_ROLES)
  @Patch(':id/resolve')
  resolve(@Param('id') id: string, @Body() dto: ResolveAbsenceCaseDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.resolve(id, dto, actor);
  }
}
