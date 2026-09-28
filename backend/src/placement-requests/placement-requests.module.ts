import { Module } from '@nestjs/common';
import { PlacementRequestsService } from './placement-requests.service';
import { PlacementRequestsController } from './placement-requests.controller';

@Module({
  providers: [PlacementRequestsService],
  controllers: [PlacementRequestsController],
})
export class PlacementRequestsModule {}
