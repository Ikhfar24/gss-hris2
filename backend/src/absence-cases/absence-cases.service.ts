import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { startOfCalendarDay } from '../common/domain/date-range';
import { CreateAbsenceCaseDto } from './dto/create-absence-case.dto';
import { SubmitAbsenceExplanationDto } from './dto/submit-absence-explanation.dto';
import { FollowUpAbsenceCaseDto } from './dto/follow-up-absence-case.dto';
import { ResolveAbsenceCaseDto } from './dto/resolve-absence-case.dto';
import { QueryAbsenceAttentionDto } from './dto/query-absence-attention.dto';

const INCLUDE = {
  employee: { select: { id: true, name: true, employeeNumber: true, coordinatorId: true } },
};

const HR_ROLES = [Role.ADMIN_HR, Role.SYSTEM_ADMIN];
const ATTENTION_STATUSES = ['PENDING_EXPLANATION', 'CONFIRMED_ALPHA'] as const;

@Injectable()
export class AbsenceCasesService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async create(dto: CreateAbsenceCaseDto, actor: AuthenticatedUser) {
    const date = startOfCalendarDay(dto.date);
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId }, select: { id: true } });
    if (!employee) throw new NotFoundException('Data karyawan tidak ditemukan');

    const placement = await this.prisma.placement.findFirst({
      where: {
        employeeId: dto.employeeId,
        status: 'ACTIVE',
        startDate: { lte: date },
        OR: [{ endDate: null }, { endDate: { gte: date } }],
      },
      include: { location: { select: { id: true, workDays: true } } },
      orderBy: { startDate: 'desc' },
    });
    if (!placement) throw new BadRequestException('Karyawan tidak memiliki penempatan aktif pada tanggal tersebut');
    if (!placement.location.workDays.includes(date.getDay())) {
      throw new BadRequestException('Tanggal tersebut bukan hari kerja di lokasi penempatan');
    }

    const holiday = await this.prisma.holiday.findFirst({
      where: { date, OR: [{ locationId: null }, { locationId: placement.location.id }] },
    });
    if (holiday) throw new BadRequestException('Tanggal tersebut adalah hari libur yang berlaku');

    const validAttendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId: dto.employeeId,
        date,
        checkInAt: { not: null },
        validationStatus: { in: ['VALID', 'APPROVED_AFTER_REVIEW'] },
      },
      select: { id: true },
    });
    if (validAttendance) throw new BadRequestException('Karyawan sudah memiliki absensi valid pada tanggal tersebut');

    const existing = await this.prisma.absenceCase.findUnique({
      where: { employeeId_date: { employeeId: dto.employeeId, date } },
    });
    if (existing) throw new BadRequestException('Kasus ketidakhadiran untuk tanggal tersebut sudah ada');

    const absenceCase = await this.prisma.absenceCase.create({
      data: { employeeId: dto.employeeId, date, status: 'PENDING_EXPLANATION' },
      include: INCLUDE,
    });
    await this.record(actor, 'ABSENCE_CASE_CREATE', absenceCase.id, null, { status: absenceCase.status, date }, 'ABSENCE_CASE_CREATE');
    return absenceCase;
  }

  async attention(query: QueryAbsenceAttentionDto, actor: AuthenticatedUser) {
    const statuses = query.status
      ? (Array.isArray(query.status) ? query.status : [query.status])
      : [...ATTENTION_STATUSES];
    return this.prisma.absenceCase.findMany({
      where: {
        status: { in: statuses },
        ...(actor.role === Role.KOORDINATOR ? { employee: { coordinatorId: actor.userId } } : {}),
      },
      include: INCLUDE,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const absenceCase = await this.getCase(id);
    await this.assertCanAccess(absenceCase, actor);
    return absenceCase;
  }

  async submitExplanation(id: string, dto: SubmitAbsenceExplanationDto, actor: AuthenticatedUser) {
    const absenceCase = await this.getCase(id);
    const employeeId = await this.resolveOwnEmployeeId(actor.userId);
    if (absenceCase.employeeId !== employeeId) throw new ForbiddenException('Anda hanya dapat menjelaskan ketidakhadiran sendiri');
    if (absenceCase.status !== 'PENDING_EXPLANATION') throw new BadRequestException('Kasus ini sudah diselesaikan');

    const updated = await this.prisma.absenceCase.update({
      where: { id }, data: { explanation: dto.explanation }, include: INCLUDE,
    });
    await this.record(actor, 'ABSENCE_CASE_EXPLANATION_SUBMIT', id, { explanation: absenceCase.explanation }, { explanation: dto.explanation }, 'EMPLOYEE');
    return updated;
  }

  async followUp(id: string, dto: FollowUpAbsenceCaseDto, actor: AuthenticatedUser) {
    const absenceCase = await this.getCase(id);
    if (actor.role === Role.KOORDINATOR && absenceCase.employee.coordinatorId !== actor.userId) {
      throw new ForbiddenException('Anda hanya dapat menindaklanjuti kasus tim sendiri');
    }
    if (![Role.KOORDINATOR, ...HR_ROLES].includes(actor.role as Role)) throw new ForbiddenException('Anda tidak berwenang menindaklanjuti kasus ini');
    if (absenceCase.status !== 'PENDING_EXPLANATION') throw new BadRequestException('Kasus ini sudah diselesaikan');

    const updated = await this.prisma.absenceCase.update({ where: { id }, data: { note: dto.note }, include: INCLUDE });
    await this.record(actor, 'ABSENCE_CASE_FOLLOW_UP', id, { note: absenceCase.note }, { note: dto.note }, 'COORDINATOR_FOLLOW_UP', dto.note);
    return updated;
  }

  async resolve(id: string, dto: ResolveAbsenceCaseDto, actor: AuthenticatedUser) {
    const absenceCase = await this.getCase(id);
    if (!HR_ROLES.includes(actor.role as Role)) throw new ForbiddenException('Hanya HR atau System Admin yang dapat menyelesaikan kasus');
    if (absenceCase.status !== 'PENDING_EXPLANATION') throw new BadRequestException('Kasus ini sudah diselesaikan');
    if (Date.now() - absenceCase.createdAt.getTime() < 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Kasus harus belum terselesaikan setidaknya 24 jam sebelum dapat diputuskan');
    }

    const status = dto.decision === 'EXCUSE' ? 'EXCUSED' : 'CONFIRMED_ALPHA';
    const updated = await this.prisma.absenceCase.update({
      where: { id },
      data: { status, confirmedById: actor.userId, confirmedAt: new Date(), note: dto.reason },
      include: INCLUDE,
    });
    await this.record(actor, 'ABSENCE_CASE_RESOLVE', id, { status: absenceCase.status, note: absenceCase.note }, { status, reason: dto.reason }, 'HR_RESOLUTION', dto.reason);
    return updated;
  }

  private async getCase(id: string) {
    const absenceCase = await this.prisma.absenceCase.findUnique({ where: { id }, include: INCLUDE });
    if (!absenceCase) throw new NotFoundException('Kasus ketidakhadiran tidak ditemukan');
    return absenceCase;
  }

  private async resolveOwnEmployeeId(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user?.employeeId) throw new BadRequestException('Akun ini belum terhubung ke data karyawan. Hubungi HR.');
    return user.employeeId;
  }

  private async assertCanAccess(absenceCase: { employeeId: string; employee: { coordinatorId: string | null } }, actor: AuthenticatedUser) {
    if (HR_ROLES.includes(actor.role as Role)) return;
    if (actor.role === Role.KOORDINATOR && absenceCase.employee.coordinatorId === actor.userId) return;
    if (absenceCase.employeeId === await this.resolveOwnEmployeeId(actor.userId).catch(() => null)) return;
    throw new ForbiddenException('Anda tidak berwenang mengakses kasus ini');
  }

  private async record(actor: AuthenticatedUser, action: string, entityId: string, oldValue: unknown, newValue: unknown, source: string, reason?: string) {
    await this.auditLog.record({ actorId: actor.userId, actorRole: actor.role, action, entity: 'AbsenceCase', entityId, oldValue, newValue, source, reason });
  }
}
