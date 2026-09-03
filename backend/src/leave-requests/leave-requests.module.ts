import { Module } from '@nestjs/common';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveRequestsController } from './leave-requests.controller';

@Module({
  providers: [LeaveRequestsService],
  controllers: [LeaveRequestsController],
})
export class LeaveRequestsModule {}
