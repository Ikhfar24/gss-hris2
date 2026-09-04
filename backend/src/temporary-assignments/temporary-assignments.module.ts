import { Module } from '@nestjs/common';
import { TemporaryAssignmentsController } from './temporary-assignments.controller';
import { TemporaryAssignmentsService } from './temporary-assignments.service';

@Module({ providers: [TemporaryAssignmentsService], controllers: [TemporaryAssignmentsController] })
export class TemporaryAssignmentsModule {}
