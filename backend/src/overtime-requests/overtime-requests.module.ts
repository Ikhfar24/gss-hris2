import { Module } from '@nestjs/common';
import { OvertimeRequestsController } from './overtime-requests.controller';
import { OvertimeRequestsService } from './overtime-requests.service';

@Module({
  controllers: [OvertimeRequestsController],
  providers: [OvertimeRequestsService],
})
export class OvertimeRequestsModule {}
