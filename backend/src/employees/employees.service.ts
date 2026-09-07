import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeStatusDto, UpdateEmployeeDto } from './dto/update-employee.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { BulkDeactivateEmployeesDto, EmployeeImportRowDto, ImportEmployeesDto } from './dto/batch7-employees.dto';
import { buildPdf, buildXlsx } from '../common/utils/export.util';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

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
      ...(actor.role === Role.KARYAWAN ? { user: { is: { id: actor.userId } } } : {}),
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
    this.assertEmployeeScope(employee, actor);
    return this.present(employee, actor);
  }

  async find360(id: string, actor: AuthenticatedUser) {
    const employee = await this.prisma.employee.findUnique({ where: { id }, include: {
      user: { select: { id: true } },
      placements: { orderBy: { startDate: 'desc' }, include: { location: { select: { id: true, name: true, clientId: true } } } },
      contracts: { orderBy: { startDate: 'desc' } },
      attendances: { orderBy: { date: 'desc' }, take: 30, select: { id: true, date: true, checkInAt: true, checkOutAt: true, latenessStatus: true, validationStatus: true, payableStatus: true, location: { select: { id: true, name: true } } } },
      leaveRequests: { orderBy: { requestedAt: 'desc' }, take: 20, select: { id: true, type: true, startDate: true, endDate: true, status: true, requestedAt: true, reviewedAt: true } },
      temporaryAssignments: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, startDate: true, endDate: true, status: true, reason: true, location: { select: { id: true, name: true } } } },
      absenceCases: { orderBy: { date: 'desc' }, take: 20, select: { id: true, date: true, status: true, note: true, createdAt: true } },
      overtimeRequests: { orderBy: { date: 'desc' }, take: 20, select: { id: true, date: true, startTime: true, endTime: true, status: true, reason: true, requestedAt: true } },
      profileChangeRequests: { orderBy: { requestedAt: 'desc' }, take: 20, select: { id: true, status: true, requestedAt: true, reviewedAt: true, reviewNote: true } },
    } });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
    this.assertEmployeeScope(employee, actor);
    const { attendances, leaveRequests, temporaryAssignments, absenceCases, overtimeRequests, profileChangeRequests, ...base } = employee;
    return {
      profile: this.present(base, actor),
      recentAttendance: attendances,
      leaveRequests,
      temporaryAssignments,
      absenceCases,
      overtimeRequests,
      profileChangeHistory: profileChangeRequests,
    };
  }

  async export(format: 'xlsx' | 'pdf', actor: AuthenticatedUser) {
    const result = await this.findAll(actor, { pageSize: 100 });
    const rows = result.data.map((employee: any) => ({
      name: employee.name, employeeNumber: employee.employeeNumber, employmentType: employee.employmentType,
      status: employee.status, jobTitle: employee.jobTitle, joinDate: employee.joinDate instanceof Date ? employee.joinDate.toISOString().slice(0, 10) : employee.joinDate,
      location: employee.placements?.[0]?.location?.name,
    }));
    const columns = [{ header: 'Nama', key: 'name' }, { header: 'NIP', key: 'employeeNumber' }, { header: 'Tipe', key: 'employmentType' }, { header: 'Status', key: 'status' }, { header: 'Jabatan', key: 'jobTitle' }, { header: 'Tanggal Bergabung', key: 'joinDate' }, { header: 'Lokasi', key: 'location' }];
    const buffer = format === 'xlsx' ? await buildXlsx('Karyawan', columns, rows) : await buildPdf('Daftar Karyawan', columns, rows);
    return { buffer, filename: `daftar-karyawan.${format}`, mime: format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf' };
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
    return this.prisma.$transaction((tx) => this.updateWithClient(tx, id, dto, actor));
  }

  async import(dto: ImportEmployeesDto, actor: AuthenticatedUser) {
    const errors: { row: number; errors: string[] }[] = [];
    const seenNik = new Set<string>();
    const seenEmployeeNumber = new Set<string>();
    const identities = dto.rows.flatMap((row) => [row.nik, row.employeeNumber].filter((value): value is string => !!value));
    const existing = identities.length ? await this.prisma.employee.findMany({ where: { OR: [{ nik: { in: identities } }, { employeeNumber: { in: identities } }] }, select: { nik: true, employeeNumber: true } }) : [];
    const existingNik = new Set(existing.map((employee) => employee.nik).filter(Boolean));
    const existingEmployeeNumber = new Set(existing.map((employee) => employee.employeeNumber).filter(Boolean));
    const locationIds = [...new Set(dto.rows.map((row) => row.initialLocationId).filter((value): value is string => !!value))];
    const locations = locationIds.length ? await this.prisma.location.findMany({ where: { id: { in: locationIds } }, select: { id: true } }) : [];
    const knownLocations = new Set(locations.map((location) => location.id));

    dto.rows.forEach((rawRow, index) => {
      const row = plainToInstance(EmployeeImportRowDto, rawRow);
      const rowErrors: string[] = [];
      validateSync(row, { whitelist: true, forbidNonWhitelisted: true }).forEach((error) => {
        rowErrors.push(...Object.values(error.constraints ?? {}));
      });
      if (!row.name?.trim()) rowErrors.push('name wajib diisi');
      if (!row.employmentType) rowErrors.push('employmentType wajib diisi');
      if (!row.joinDate || Number.isNaN(new Date(row.joinDate).getTime())) rowErrors.push('joinDate wajib berupa tanggal valid');
      if (row.nik && (seenNik.has(row.nik) || existingNik.has(row.nik))) rowErrors.push('NIK duplikat');
      if (row.employeeNumber && (seenEmployeeNumber.has(row.employeeNumber) || existingEmployeeNumber.has(row.employeeNumber))) rowErrors.push('NIP duplikat');
      if (row.initialLocationId && !knownLocations.has(row.initialLocationId)) rowErrors.push('location tidak ditemukan');
      if (row.nik) seenNik.add(row.nik);
      if (row.employeeNumber) seenEmployeeNumber.add(row.employeeNumber);
      if (rowErrors.length) errors.push({ row: index + 1, errors: rowErrors });
    });
    if (errors.length || dto.commit !== true || dto.dryRun === true) return { dryRun: true, valid: errors.length === 0, rowCount: dto.rows.length, errors };

    const created = await this.prisma.$transaction(async (tx) => {
      const records: { id: string }[] = [];
      for (const rawRow of dto.rows) {
        const row = plainToInstance(EmployeeImportRowDto, rawRow);
        this.validateAttendanceEligibility(row.attendanceRequired, row.attendanceExemptionReason);
        const { initialLocationId, joinDate, trainingEndDate, dateOfBirth, ...data } = row;
        records.push(await tx.employee.create({ data: {
          ...data, joinDate: new Date(joinDate), trainingEndDate: trainingEndDate ? new Date(trainingEndDate) : null, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          placements: initialLocationId ? { create: { locationId: initialLocationId, startDate: new Date(joinDate), status: 'ACTIVE' } } : undefined,
        }, select: { id: true } }));
      }
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'EMPLOYEE_IMPORT', entity: 'Employee', newValue: { rowCount: records.length }, source: 'EMPLOYEE_IMPORT' } });
      return records;
    });
    return { dryRun: false, valid: true, created: created.length, errors: [] };
  }

  async bulkDeactivate(dto: BulkDeactivateEmployeesDto, actor: AuthenticatedUser) {
    const ids = [...new Set(dto.employeeIds)];
    const result = await this.prisma.$transaction(async (tx) => {
      const outcomes: { employeeId: string; success: boolean; error?: string }[] = [];
      for (const id of ids) {
        try {
          await this.updateWithClient(tx, id, { status: EmployeeStatusDto.INACTIVE, reason: dto.reason }, actor);
          outcomes.push({ employeeId: id, success: true });
        } catch (error) {
          outcomes.push({ employeeId: id, success: false, error: error instanceof Error ? error.message : 'Gagal menonaktifkan karyawan' });
        }
      }
      return outcomes;
    });
    return { results: result, deactivated: result.filter((item) => item.success).length, failed: result.filter((item) => !item.success).length };
  }

  private async updateWithClient(tx: any, id: string, dto: UpdateEmployeeDto, actor: AuthenticatedUser) {
    const before = await tx.employee.findUnique({ where: { id }, include: SUMMARY_INCLUDE });
    if (!before) throw new NotFoundException('Karyawan tidak ditemukan');
    const changedSensitive = Object.keys(dto).some((key) => key !== 'reason' && SENSITIVE_FIELDS.has(key) && (dto as any)[key] !== (before as any)[key]);
    if (changedSensitive && !dto.reason?.trim()) throw new BadRequestException('Alasan wajib diisi untuk perubahan data karyawan sensitif');
    this.validateAttendanceEligibility(dto.attendanceRequired, dto.attendanceExemptionReason, before);
    await this.assertIdentityUnique(dto.nik, dto.employeeNumber, id, tx);
    const { trainingEndDate, dateOfBirth, reason, ...rest } = dto;
    const updated = await tx.employee.update({ where: { id }, data: { ...rest, trainingEndDate: trainingEndDate ? new Date(trainingEndDate) : undefined, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined }, include: SUMMARY_INCLUDE });
    if (dto.status === 'RESIGNED') await tx.user.updateMany({ where: { employeeId: id, isActive: true }, data: { isActive: false } });
    await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: changedSensitive ? 'EMPLOYEE_SENSITIVE_UPDATE' : 'EMPLOYEE_UPDATE', entity: 'Employee', entityId: id, oldValue: this.auditProjection(before) as any, newValue: this.auditProjection(updated) as any, reason: reason ?? null, source: 'EMPLOYEE_MANAGEMENT', relatedEntityId: updated.user?.id } });
    return this.present(updated, actor);
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

  private async assertIdentityUnique(nik?: string, employeeNumber?: string, currentId?: string, client: any = this.prisma) {
    const identities = [nik ? { nik } : null, employeeNumber ? { employeeNumber } : null].filter(Boolean) as any[];
    if (identities.length === 0) return;
    const duplicate = await client.employee.findFirst({ where: { OR: identities, NOT: currentId ? { id: currentId } : undefined }, select: { id: true } });
    if (duplicate) throw new ConflictException('NIK atau NIP sudah digunakan oleh karyawan lain');
  }

  private validateAttendanceEligibility(required?: boolean, reason?: string, existing?: { attendanceRequired: boolean; attendanceExemptionReason: string | null }) {
    const becomesExempt = required === false || (required === undefined && existing?.attendanceRequired === false);
    if (becomesExempt && !(reason ?? existing?.attendanceExemptionReason)?.trim()) throw new BadRequestException('Alasan exemption absensi wajib diisi');
  }

  private assertEmployeeScope(employee: { coordinatorId: string | null; user?: { id: string } | null }, actor: AuthenticatedUser) {
    if (actor.role === Role.KOORDINATOR && employee.coordinatorId !== actor.userId) throw new ForbiddenException('Anda hanya dapat mengakses karyawan dalam tim Anda');
    if (actor.role === Role.KARYAWAN && employee.user?.id !== actor.userId) throw new ForbiddenException('Anda hanya dapat mengakses profil sendiri');
  }

  private present(employee: any, actor: AuthenticatedUser) {
    if ([Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.DIREKTUR].includes(actor.role as Role)) return employee;
    if (actor.role === Role.KARYAWAN) {
      const { dailyRate, contracts, ...selfService } = employee;
      return selfService;
    }
    const { id, name, employmentType, status, joinDate, jobTitle, attendanceRequired, attendanceExemptionReason, coordinatorId, createdAt, updatedAt, placements } = employee;
    return { id, name, employmentType, status, joinDate, jobTitle, attendanceRequired, attendanceExemptionReason, coordinatorId, createdAt, updatedAt, placements };
  }

  private auditProjection(employee: any) {
    const { nik, employeeNumber, bankAccountNumber, bpjsKesehatanNumber, bpjsKetenagakerjaanNumber, dailyRate, contracts, ...safe } = employee;
    return safe;
  }
}
