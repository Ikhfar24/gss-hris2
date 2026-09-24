import { Module } from '@nestjs/common';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveBalancesController } from './leave-balances.controller';

@Module({
  providers: [LeaveRequestsService],
  controllers: [LeaveRequestsController, LeaveBalancesController],
})
export class LeaveRequestsModule {}
