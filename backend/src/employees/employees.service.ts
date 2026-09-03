import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

const INCLUDE_SUMMARY = {
  placements: {
    where: { status: 'ACTIVE' as const },
    include: { location: { select: { id: true, name: true } } },
  },
  contracts: {
    where: { status: 'ACTIVE' as const },
    orderBy: { startDate: 'desc' as const },
    take: 1,
  },
};

@Injectable()
export class EmployeesService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  findAll(actor: AuthenticatedUser) {
    return this.prisma.employee.findMany({
      where: actor.role === Role.KOORDINATOR ? { coordinatorId: actor.userId } : undefined,
      include: INCLUDE_SUMMARY,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, actor?: AuthenticatedUser) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        contracts: { orderBy: { startDate: 'desc' } },
        placements: {
          include: { location: { select: { id: true, name: true } } },
          orderBy: { startDate: 'desc' },
        },
      },
    });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
    if (actor?.role === Role.KOORDINATOR && employee.coordinatorId !== actor.userId) {
      throw new ForbiddenException('Anda hanya dapat mengakses karyawan dalam tim Anda');
    }
    return employee;
  }

  async findByUserId(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user?.employeeId) {
      throw new NotFoundException('Akun ini belum terhubung ke data karyawan');
    }
    return this.findOne(user.employeeId);
  }

  async create(dto: CreateEmployeeDto, actorId: string) {
    const { initialLocationId, joinDate, trainingEndDate, ...rest } = dto;

    const employee = await this.prisma.employee.create({
      data: {
        ...rest,
        joinDate: new Date(joinDate),
        trainingEndDate: trainingEndDate ? new Date(trainingEndDate) : null,
        // BR-002: first placement, if given, becomes the active location
        // used to resolve attendance rules from day one.
        placements: initialLocationId
          ? {
              create: {
                locationId: initialLocationId,
                startDate: new Date(joinDate),
                status: 'ACTIVE',
              },
            }
          : undefined,
      },
      include: INCLUDE_SUMMARY,
    });

    await this.auditLog.record({
      actorId,
      action: 'EMPLOYEE_CREATE',
      entity: 'Employee',
      entityId: employee.id,
      newValue: employee,
    });

    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto, actorId: string) {
    const before = await this.findOne(id);
    const { trainingEndDate, reason, ...rest } = dto;

    const isSensitive =
      dto.status !== undefined && dto.status !== before.status;

    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        ...rest,
        trainingEndDate: trainingEndDate ? new Date(trainingEndDate) : undefined,
      },
      include: INCLUDE_SUMMARY,
    });

    await this.auditLog.record({
      actorId,
      action: isSensitive ? 'EMPLOYEE_STATUS_CHANGE' : 'EMPLOYEE_UPDATE',
      entity: 'Employee',
      entityId: id,
      oldValue: isSensitive ? { status: before.status } : before,
      newValue: isSensitive ? { status: updated.status } : updated,
      reason: reason ?? null,
    });

    return updated;
  }
}
