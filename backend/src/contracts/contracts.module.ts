import { Module } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';

@Module({
  providers: [ContractsService],
  controllers: [ContractsController],
})
export class ContractsModule {}
