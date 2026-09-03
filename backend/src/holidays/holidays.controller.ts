import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { HolidaysService } from './holidays.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('holidays')
export class HolidaysController {
  constructor(private service: HolidaysService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Post()
  create(@Body() dto: CreateHolidayDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor.userId);
  }

  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.remove(id, actor.userId);
  }
}
