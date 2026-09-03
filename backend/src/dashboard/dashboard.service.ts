import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /**
   * §14 Dashboard HR: single ringkasan operasional (attendance today +
   * pending approvals + active placements), scoped by role — Koordinator
   * only sees their own team (Employee.coordinatorId), everyone else
   * (HR/Direktur/System Admin) sees company-wide, matching the same
   * scoping already used in LeaveRequestsService.findAll.
   */
  async summary(actor: AuthenticatedUser) {
    const isKoordinator = actor.role === Role.KOORDINATOR;
    const teamScope = isKoordinator ? { coordinatorId: actor.userId } : {};
    const today = startOfDay(new Date());
    const weekday = today.getDay();

    const [scheduledToday, attendanceRecords, pendingLeave, pendingPlacement, activePlacements] = await Promise.all([
      this.prisma.employee.count({
        where: {
          status: 'ACTIVE',
          ...teamScope,
          placements: { some: { status: 'ACTIVE', location: { workDays: { has: weekday } } } },
        },
      }),
      this.prisma.attendance.findMany({
        where: { date: today, employee: teamScope },
        select: { checkInAt: true, latenessStatus: true, validationStatus: true },
      }),
      this.prisma.leaveRequest.count({ where: { status: 'PENDING', employee: teamScope } }),
      isKoordinator
        ? // Koordinator only proposes placement changes, never approves —
          // "pending" for them means requests THEY submitted, not a queue to action.
          this.prisma.placementRequest.count({
            where: { requestedById: actor.userId, status: { in: ['PENDING_HR', 'PENDING_DIRECTOR'] } },
          })
        : this.prisma.placementRequest.count({ where: { status: { in: ['PENDING_HR', 'PENDING_DIRECTOR'] } } }),
      this.prisma.placement.count({ where: { status: 'ACTIVE', employee: teamScope } }),
    ]);

    const hadir = attendanceRecords.filter((r) => r.checkInAt).length;
    const terlambat = attendanceRecords.filter((r) => r.latenessStatus === 'LATE').length;
    const perluDitinjau = attendanceRecords.filter((r) => r.validationStatus === 'NEEDS_REVIEW').length;

    return {
      date: today.toISOString().slice(0, 10),
      attendance: {
        hadir,
        terlambat,
        tidakHadir: Math.max(scheduledToday - hadir, 0),
        perluDitinjau,
      },
      pendingLeaveRequests: pendingLeave,
      pendingPlacementRequests: pendingPlacement,
      activePlacements,
    };
  }
}
