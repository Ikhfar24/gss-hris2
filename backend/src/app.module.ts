import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompanySettingsModule } from './company-settings/company-settings.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { ClientsModule } from './clients/clients.module';
import { LocationsModule } from './locations/locations.module';
import { EmployeesModule } from './employees/employees.module';
import { ContractsModule } from './contracts/contracts.module';
import { PlacementsModule } from './placements/placements.module';
import { PlacementRequestsModule } from './placement-requests/placement-requests.module';
import { AttendanceModule } from './attendance/attendance.module';
import { HolidaysModule } from './holidays/holidays.module';
import { LeaveRequestsModule } from './leave-requests/leave-requests.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { PayrollModule } from './payroll/payroll.module';
import { MediaModule } from './media/media.module';
import { EmployeeProfileChangeRequestsModule } from './employee-profile-change-requests/employee-profile-change-requests.module';
import { TemporaryAssignmentsModule } from './temporary-assignments/temporary-assignments.module';
import { AbsenceCasesModule } from './absence-cases/absence-cases.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]), // global rate limit, tightened per-route on sensitive endpoints
    PrismaModule,
    AuditLogModule,
    AuthModule,
    UsersModule,
    CompanySettingsModule,
    // Phase 2: Employee & Placement (PRD §8, §10)
    ClientsModule,
    LocationsModule,
    EmployeesModule,
    ContractsModule,
    PlacementsModule,
    PlacementRequestsModule,
    // Phase 3: Attendance (PRD §11, §12)
    AttendanceModule,
    HolidaysModule,
    // Phase 4: Cuti, Izin & Resign (PRD §13)
    LeaveRequestsModule,
    // Phase 5: Monitoring & Reporting (PRD §14, §16)
    DashboardModule,
    ReportsModule,
    // Phase 6: Payroll (PRD §15)
    PayrollModule,
    MediaModule,
    EmployeeProfileChangeRequestsModule,
    TemporaryAssignmentsModule,
    AbsenceCasesModule,
  ],
})
export class AppModule {}
