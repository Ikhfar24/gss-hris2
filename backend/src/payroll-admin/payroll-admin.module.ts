import { Module } from '@nestjs/common';
import { PayrollAdminController } from './payroll-admin.controller';
import { PayrollAdminService } from './payroll-admin.service';

@Module({
  providers: [PayrollAdminService],
  controllers: [PayrollAdminController],
})
export class PayrollAdminModule {}
