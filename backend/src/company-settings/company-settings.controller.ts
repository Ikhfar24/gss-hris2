import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { CompanySettingsService } from './company-settings.service';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';

@Controller('company-settings')
export class CompanySettingsController {
  constructor(private service: CompanySettingsService) {}

  // No guard: branding must be fetchable before login (login page logo/name).
  @Get()
  get() {
    return this.service.get();
  }

  // Changing company identity is explicitly an Admin/HR/System Admin action
  // per PRD section 5 ("HR dapat mengubah konfigurasi melalui dashboard").
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
  @Patch()
  update(@Body() dto: UpdateCompanySettingsDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.update(dto, actor.userId);
  }
}
