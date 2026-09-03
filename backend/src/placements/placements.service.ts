import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class PlacementsService {
  constructor(private prisma: PrismaService) {}

  // PRD §10.1 — full placement history for one employee, oldest last.
  async findByEmployee(employeeId: string, actor: AuthenticatedUser) {
    if (actor.role === Role.KOORDINATOR) {
      const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { coordinatorId: true } });
      if (!employee || employee.coordinatorId !== actor.userId) {
        throw new ForbiddenException('Anda hanya dapat mengakses penempatan tim Anda');
      }
    }
    return this.prisma.placement.findMany({
      where: { employeeId },
      include: { location: { select: { id: true, name: true } } },
      orderBy: { startDate: 'desc' },
    });
  }

  // Monitoring overview: every currently-active placement across all
  // employees (§14 Dashboard HR — "Penempatan aktif").
  findAllActive(actor: AuthenticatedUser) {
    return this.prisma.placement.findMany({
      where: actor.role === Role.KOORDINATOR
        ? { status: 'ACTIVE', employee: { coordinatorId: actor.userId } }
        : { status: 'ACTIVE' },
      include: {
        employee: { select: { id: true, name: true, employmentType: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }
}
