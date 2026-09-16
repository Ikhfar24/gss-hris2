import { Controller, Get } from '@nestjs/common';
import { CompanySettingsService } from './company-settings.service';

@Controller('branding')
export class BrandingController {
  constructor(private service: CompanySettingsService) {}

  @Get()
  get() {
    return this.service.getBranding();
  }
}
