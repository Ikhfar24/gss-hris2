import { Module } from '@nestjs/common';
import { PlacementRequestsService } from './placement-requests.service';
import { PlacementRequestsController } from './placement-requests.controller';
import { TemporaryAssignmentsModule } from '../temporary-assignments/temporary-assignments.module';

@Module({
  imports: [TemporaryAssignmentsModule],
  providers: [PlacementRequestsService],
  controllers: [PlacementRequestsController],
})
export class PlacementRequestsModule {}
