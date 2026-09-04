import { Module } from '@nestjs/common';
import { EmployeeProfileChangeRequestsController } from './employee-profile-change-requests.controller';
import { EmployeeProfileChangeRequestsService } from './employee-profile-change-requests.service';

@Module({ controllers: [EmployeeProfileChangeRequestsController], providers: [EmployeeProfileChangeRequestsService] })
export class EmployeeProfileChangeRequestsModule {}
