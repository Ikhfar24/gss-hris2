import { Module } from '@nestjs/common';
import { AbsenceCasesService } from './absence-cases.service';
import { AbsenceCasesController } from './absence-cases.controller';

@Module({
  providers: [AbsenceCasesService],
  controllers: [AbsenceCasesController],
})
export class AbsenceCasesModule {}
