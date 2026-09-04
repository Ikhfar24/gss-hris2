import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeStatusDto, UpdateEmployeeDto } from './dto/update-employee.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

const SUMMARY_INCLUDE = {
  user: { select: { id: true, email: true, role: true, isActive: true } },
  placements: { where: { status: 'ACTIVE' as const }, include: { location: { select: { id: true, name: true, clientId: true } } } },
  contracts: { where: { status: 'ACTIVE' as const }, orderBy: { startDate: 'desc' as const }, take: 1 },
};
const SENSITIVE_FIELDS = new Set(['nik', 'employeeNumber', 'bankAccountNumber', 'bpjsKesehatanNumber', 'bpjsKetenagakerjaanNumber', 'employmentType', 'status', 'attendanceRequired', 'attendanceExemptionReason', 'joinDate']);

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async findAll(actor: AuthenticatedUser, query: any = {}) {
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 25, 1), 100);
    const where: any = {
      ...(actor.role === Role.KOORDINATOR ? { coordinatorId: actor.userId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.employmentType ? { employmentType: query.employmentType } : {}),
      ...(query.employeeNumber ? { employeeNumber: { contains: query.employeeNumber, mode: 'insensitive' } } : {}),
      ...(query.linked === 'true' ? { user: { isNot: null } } : query.linked === 'false' ? { user: null } : {}),
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { employeeNumber: { contains: query.search, mode: 'insensitive' } }, { jobTitle: { contains: query.search, mode: 'insensitive' } }] } : {}),
    };
    const [employees, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({ where, include: SUMMARY_INCLUDE, orderBy: { [query.sort === 'name' ? 'name' : 'createdAt']: query.direction === 'asc' ? 'asc' : 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.employee.count({ where }),
    ]);
    return { data: employees.map((employee) => this.present(employee, actor)), meta: { page, pageSize, total } };
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const employee = await this.prisma.employee.findUnique({ where: { id }, include: { ...SUMMARY_INCLUDE, contracts: { orderBy: { startDate: 'desc' } }, placements: { include: { location: { select: { id: true, name: true, clientId: true } } }, orderBy: { startDate: 'desc' } } } });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
    if (actor.role === Role.KOORDINATOR && employee.coordinatorId !== actor.userId) throw new ForbiddenException('Anda hanya dapat mengakses karyawan dalam tim Anda');
    return this.present(employee, actor);
  }

  async findByUserId(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user?.employeeId) throw new NotFoundException('Akun ini belum terhubung ke data karyawan');
    return this.findOne(user.employeeId, { userId, email: '', role: Role.KARYAWAN });
  }

  async manpower() {
    return this.prisma.employee.findMany({
      select: { id: true, name: true, employeeNumber: true, employmentType: true, status: true, jobTitle: true, placements: { where: { status: 'ACTIVE' }, select: { location: { select: { id: true, name: true, clientId: true } } } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateEmployeeDto, actor: AuthenticatedUser) {
    this.validateAttendanceEligibility(dto.attendanceRequired, dto.attendanceExemptionReason);
    await this.assertIdentityUnique(dto.nik, dto.employeeNumber);
    const { initialLocationId, joinDate, trainingEndDate, dateOfBirth, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          ...rest, joinDate: new Date(joinDate), trainingEndDate: trainingEndDate ? new Date(trainingEndDate) : null, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          placements: initialLocationId ? { create: { locationId: initialLocationId, startDate: new Date(joinDate), status: 'ACTIVE' } } : undefined,
        }, include: SUMMARY_INCLUDE,
      });
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'EMPLOYEE_CREATE', entity: 'Employee', entityId: employee.id, newValue: this.auditProjection(employee) as any, source: 'EMPLOYEE_MANAGEMENT' } });
      return this.present(employee, actor);
    });
  }

  async update(id: string, dto: UpdateEmployeeDto, actor: AuthenticatedUser) {
    const before = await this.prisma.employee.findUnique({ where: { id }, include: SUMMARY_INCLUDE });
    if (!before) throw new NotFoundException('Karyawan tidak ditemukan');
    const changedSensitive = Object.keys(dto).some((key) => key !== 'reason' && SENSITIVE_FIELDS.has(key) && (dto as any)[key] !== (before as any)[key]);
    if (changedSensitive && !dto.reason?.trim()) throw new BadRequestException('Alasan wajib diisi untuk perubahan data karyawan sensitif');
    this.validateAttendanceEligibility(dto.attendanceRequired, dto.attendanceExemptionReason, before);
    await this.assertIdentityUnique(dto.nik, dto.employeeNumber, id);
    const { trainingEndDate, dateOfBirth, reason, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({ where: { id }, data: { ...rest, trainingEndDate: trainingEndDate ? new Date(trainingEndDate) : undefined, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined }, include: SUMMARY_INCLUDE });
      if (dto.status === 'RESIGNED') {
        await tx.user.updateMany({ where: { employeeId: id, isActive: true }, data: { isActive: false } });
      }
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: changedSensitive ? 'EMPLOYEE_SENSITIVE_UPDATE' : 'EMPLOYEE_UPDATE', entity: 'Employee', entityId: id, oldValue: this.auditProjection(before) as any, newValue: this.auditProjection(updated) as any, reason: reason ?? null, source: 'EMPLOYEE_MANAGEMENT', relatedEntityId: updated.user?.id } });
      return this.present(updated, actor);
    });
  }

  deactivate(id: string, reason: string, actor: AuthenticatedUser) {
    return this.update(id, { status: EmployeeStatusDto.INACTIVE, reason }, actor);
  }

  async reactivate(id: string, reason: string, actor: AuthenticatedUser) {
    const employee = await this.prisma.employee.findUnique({ where: { id }, select: { status: true } });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
    if (employee.status === 'RESIGNED') throw new BadRequestException('Karyawan resign memerlukan proses employment baru, bukan reaktivasi');
    return this.update(id, { status: EmployeeStatusDto.ACTIVE, reason }, actor);
  }

  async remove(id: string, reason: string, actor: AuthenticatedUser) {
    const employee = await this.prisma.employee.findUnique({ where: { id }, select: { id: true, user: { select: { id: true } }, _count: { select: { attendances: true, leaveRequests: true, placements: true, contracts: true, payrollSlips: true, profileChangeRequests: true, leaveBalances: true, temporaryAssignments: true, absenceCases: true, overtimeRequests: true } } } });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
    const auditCount = await this.prisma.auditLog.count({ where: { OR: [{ entity: 'Employee', entityId: id }, { relatedEntityId: id }] } });
    if (employee.user || auditCount > 0 || Object.values(employee._count).some((count) => count > 0)) {
      throw new ConflictException('Karyawan memiliki akun atau riwayat terlindungi dan tidak dapat dihapus. Gunakan nonaktifkan atau koreksi status.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.employee.delete({ where: { id } });
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'EMPLOYEE_DELETE_SAFE', entity: 'Employee', entityId: id, reason, source: 'EMPLOYEE_MANAGEMENT' } });
    });
    return { deleted: true };
  }

  private async assertIdentityUnique(nik?: string, employeeNumber?: string, currentId?: string) {
    const identities = [nik ? { nik } : null, employeeNumber ? { employeeNumber } : null].filter(Boolean) as any[];
    if (identities.length === 0) return;
    const duplicate = await this.prisma.employee.findFirst({ where: { OR: identities, NOT: currentId ? { id: currentId } : undefined }, select: { id: true } });
    if (duplicate) throw new ConflictException('NIK atau NIP sudah digunakan oleh karyawan lain');
  }

  private validateAttendanceEligibility(required?: boolean, reason?: string, existing?: { attendanceRequired: boolean; attendanceExemptionReason: string | null }) {
    const becomesExempt = required === false || (required === undefined && existing?.attendanceRequired === false);
    if (becomesExempt && !(reason ?? existing?.attendanceExemptionReason)?.trim()) throw new BadRequestException('Alasan exemption absensi wajib diisi');
  }

  private present(employee: any, actor: AuthenticatedUser) {
    if ([Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.DIREKTUR].includes(actor.role as Role)) return employee;
    if (actor.role === Role.KARYAWAN) {
      const { dailyRate, contracts, ...selfService } = employee;
      return selfService;
    }
    const { nik, bankAccountNumber, bpjsKesehatanNumber, bpjsKetenagakerjaanNumber, dailyRate, contracts, email, dateOfBirth, user, ...operational } = employee;
    return operational;
  }

  private auditProjection(employee: any) {
    const { nik, employeeNumber, bankAccountNumber, bpjsKesehatanNumber, bpjsKetenagakerjaanNumber, dailyRate, contracts, ...safe } = employee;
    return safe;
  }
}
