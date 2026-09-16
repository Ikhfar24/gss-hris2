import { Module } from '@nestjs/common';
import { CompanySettingsService } from './company-settings.service';
import { CompanySettingsController } from './company-settings.controller';
import { BrandingController } from './branding.controller';

@Module({
  providers: [CompanySettingsService],
  controllers: [CompanySettingsController, BrandingController],
})
export class CompanySettingsModule {}
