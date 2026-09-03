import { Module } from '@nestjs/common';
import { CompanySettingsService } from './company-settings.service';
import { CompanySettingsController } from './company-settings.controller';

@Module({
  providers: [CompanySettingsService],
  controllers: [CompanySettingsController],
})
export class CompanySettingsModule {}
