import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { CoordinatorScopeService } from '../coordinator-scopes/coordinator-scope.service';
import { EmploymentType, Prisma } from '@prisma/client';
import { approvedFullDayAbsenceWhere } from '../common/domain/approved-full-day-absence';
import { startOfCalendarDay as startOfDay } from '../common/domain/date-range';

export interface AttentionCard {
  key: string;
  label: string;
  count: number;
  href: string;
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService, private scopes: CoordinatorScopeService) {}

  private async employeeScope(actor: AuthenticatedUser) {
    if (actor.role === Role.KARYAWAN) return { user: { is: { id: actor.userId } } };
    if (actor.role === Role.KOORDINATOR) return this.scopes.employeeWhere(actor.userId);
    return undefined;
  }

  private leaveStatus(actor: AuthenticatedUser) {
    if (actor.role === Role.KOORDINATOR) return ['PENDING_COORDINATOR'];
    if ([Role.ADMIN_HR, Role.SYSTEM_ADMIN].includes(actor.role as Role)) return ['PENDING', 'PENDING_HR'];
    if (actor.role === Role.DIREKTUR) return ['PENDING_DIRECTOR'];
    if (actor.role === Role.KARYAWAN) return ['PENDING', 'PENDING_COORDINATOR', 'PENDING_HR', 'PENDING_DIRECTOR'];
    return [];
  }

  private placementStatus(actor: AuthenticatedUser) {
    if ([Role.ADMIN_HR, Role.SYSTEM_ADMIN].includes(actor.role as Role)) return ['PENDING_HR'];
    if (actor.role === Role.DIREKTUR) return ['PENDING_DIRECTOR'];
    return [];
  }

  /** Operational counters are intentionally limited to the actor's own scope. */
  async summary(actor: AuthenticatedUser, requestedEmploymentType?: string) {
    const employeeScope = await this.employeeScope(actor);
    const employmentType = Object.values(EmploymentType).includes(requestedEmploymentType as EmploymentType) ? requestedEmploymentType as EmploymentType : undefined;
    const scopedEmployees: Prisma.EmployeeWhereInput | undefined = employmentType ? { AND: [employeeScope ?? {}, { employmentType }] } : employeeScope;
    const today = startOfDay(new Date());
    const withoutApprovedAbsence: Prisma.EmployeeWhereInput = {
      leaveRequests: { none: approvedFullDayAbsenceWhere(today) },
    };
    const attendanceEmployees: Prisma.EmployeeWhereInput = {
      ...(scopedEmployees ?? {}),
      attendanceRequired: true,
      ...withoutApprovedAbsence,
    };
    const canSeeOperations = [Role.KARYAWAN, Role.KOORDINATOR, Role.ADMIN_HR, Role.DIREKTUR, Role.KOMISARIS, Role.SYSTEM_ADMIN].includes(actor.role as Role);
    const weekday = today.getDay();
    const leaveStatus = this.leaveStatus(actor);
    const placementStatus = this.placementStatus(actor);

    const [scheduledToday, hadir, terlambat, perluDitinjau, pendingLeave, pendingPlacement, activePlacements] = await Promise.all([
      canSeeOperations ? this.prisma.employee.count({
        where: {
          status: 'ACTIVE',
          attendanceRequired: true,
          ...(scopedEmployees ?? {}),
          ...withoutApprovedAbsence,
          placements: { some: { status: 'ACTIVE', location: { workDays: { has: weekday } } } },
        },
      }) : Promise.resolve(0),
      canSeeOperations ? this.prisma.attendance.count({ where: { date: today, checkInAt: { not: null }, employee: attendanceEmployees } }) : Promise.resolve(0),
      canSeeOperations ? this.prisma.attendance.count({ where: { date: today, latenessStatus: 'LATE', employee: attendanceEmployees } }) : Promise.resolve(0),
      canSeeOperations ? this.prisma.attendance.count({ where: { date: today, validationStatus: 'NEEDS_REVIEW', employee: attendanceEmployees } }) : Promise.resolve(0),
      leaveStatus.length ? this.prisma.leaveRequest.count({
        where: { status: { in: leaveStatus as any }, ...(scopedEmployees ? { employee: scopedEmployees } : {}) },
      }) : Promise.resolve(0),
      placementStatus.length ? this.prisma.placementRequest.count({ where: { status: { in: placementStatus as any } } }) : Promise.resolve(0),
      canSeeOperations ? this.prisma.placement.count({ where: { status: 'ACTIVE', ...(scopedEmployees ? { employee: scopedEmployees } : {}) } }) : Promise.resolve(0),
    ]);

    return {
      date: today.toISOString().slice(0, 10),
      attendance: { hadir, terlambat, tidakHadir: Math.max(scheduledToday - hadir, 0), perluDitinjau },
      pendingLeaveRequests: pendingLeave,
      pendingPlacementRequests: pendingPlacement,
      activePlacements,
    };
  }

  async attention(actor: AuthenticatedUser): Promise<AttentionCard[]> {
    const teamScope = actor.role === Role.KOORDINATOR ? await this.scopes.queryWhere(actor.userId) : {};
    const cards: Array<Omit<AttentionCard, 'count'> & { count: Promise<number> }> = [];
    const add = (key: string, label: string, href: string, count: Promise<number>) => cards.push({ key, label, href, count });

    if (actor.role === Role.KOORDINATOR) {
      add('attendance-review', 'Absensi perlu ditinjau', '/attendance?validationStatus=NEEDS_REVIEW', this.prisma.attendance.count({ where: { validationStatus: 'NEEDS_REVIEW', ...teamScope } }));
      add('leave-coordinator', 'Cuti/izin menunggu koordinator', '/leave-requests', this.prisma.leaveRequest.count({ where: { status: 'PENDING_COORDINATOR', ...teamScope } }));
      add('absence-follow-up', 'Ketidakhadiran perlu tindak lanjut', '/absence-cases', this.prisma.absenceCase.count({ where: { status: { in: ['PENDING_EXPLANATION', 'CONFIRMED_ALPHA'] }, ...teamScope } }));
      add('overtime-review', 'Lembur menunggu review', '/overtime-requests', this.prisma.overtimeRequest.count({ where: { status: 'PENDING', ...teamScope } }));
    }

    if ([Role.ADMIN_HR, Role.SYSTEM_ADMIN].includes(actor.role as Role)) {
      add('attendance-review', 'Absensi perlu ditinjau', '/attendance?validationStatus=NEEDS_REVIEW', this.prisma.attendance.count({ where: { validationStatus: 'NEEDS_REVIEW' } }));
      add('leave-hr', 'Cuti/izin menunggu HR', '/leave-requests', this.prisma.leaveRequest.count({ where: { status: { in: ['PENDING', 'PENDING_HR'] } } }));
      add('placement-hr', 'Penempatan menunggu HR', '/placement-requests', this.prisma.placementRequest.count({ where: { status: 'PENDING_HR' } }));
      add('temporary-assignment', 'Penugasan sementara menunggu review', '/temporary-assignments', this.prisma.temporaryAssignment.count({ where: { status: 'PENDING' } }));
      add('profile-change', 'Perubahan profil menunggu review', '/profile-change-requests', this.prisma.employeeProfileChangeRequest.count({ where: { status: 'PENDING' } }));
      add('absence-resolve', 'Ketidakhadiran perlu diselesaikan', '/absence-cases', this.prisma.absenceCase.count({ where: { status: { in: ['PENDING_EXPLANATION', 'CONFIRMED_ALPHA'] } } }));
      add('overtime-review', 'Lembur menunggu review', '/overtime-requests', this.prisma.overtimeRequest.count({ where: { status: 'PENDING' } }));
    }

    if (actor.role === Role.KEUANGAN) {
      add('payroll-draft', 'Payroll draft perlu diproses', '/payroll', this.prisma.payrollRun.count({ where: { status: 'DRAFT' } }));
      add('payroll-revision-draft', 'Revisi payroll draft perlu diproses', '/payroll', this.prisma.payrollRevision.count({ where: { status: 'DRAFT' } }));
    }

    if (actor.role === Role.DIREKTUR) {
      add('leave-director', 'Cuti/izin menunggu Direktur', '/leave-requests', this.prisma.leaveRequest.count({ where: { status: 'PENDING_DIRECTOR' } }));
      add('placement-director', 'Mutasi menunggu Direktur', '/placement-requests', this.prisma.placementRequest.count({ where: { status: 'PENDING_DIRECTOR' } }));
      add('payroll-director', 'Payroll menunggu persetujuan', '/payroll', this.prisma.payrollRun.count({ where: { status: 'PENDING_DIRECTOR_APPROVAL' } }));
      add('payroll-revision-director', 'Revisi payroll menunggu persetujuan', '/payroll', this.prisma.payrollRevision.count({ where: { status: 'PENDING_DIRECTOR_APPROVAL' } }));
    }

    const counts = await Promise.all(cards.map((card) => card.count));
    return cards.map(({ count: _count, ...card }, index) => ({ ...card, count: counts[index] }));
  }
}
