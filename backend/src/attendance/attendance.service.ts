import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { distanceInMeters } from '../common/utils/geo.util';
import { saveBase64Image, toProtectedMediaPath } from '../common/utils/file-storage.util';
import { payableAttendanceState } from '../common/domain/attendance-payable';
import { effectiveWorkLocation } from '../common/domain/temporary-assignment';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { QueryAttendanceDto, QueryMyHistoryDto, QueryOpenAttendanceDto } from './dto/query-attendance.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { ReviewAttendanceDto } from './dto/review-attendance.dto';
import { CoordinatorScopeService } from '../coordinator-scopes/coordinator-scope.service';
import { QueryAttendanceMonitoringDto } from './dto/query-attendance-monitoring.dto';
import { approvedFullDayAbsenceWhere } from '../common/domain/approved-full-day-absence';
import { startOfCalendarDay as startOfDay } from '../common/domain/date-range';

const INCLUDE = {
  employee: { select: { id: true, name: true, employmentType: true } },
  location: { select: { id: true, name: true, radiusMeters: true } },
};

interface ResolvedEvidence {
  distance: number | null;
  accuracy: number | null;
  geofenceLatitude: number | null;
  geofenceLongitude: number | null;
  geofenceRadiusMeters: number | null;
  locationName: string;
  gpsStatus: 'OK' | 'OUT_OF_RADIUS' | 'UNAVAILABLE' | 'SUSPICIOUS' | 'FAILED' | null;
  selfieUrl: string | null;
  faceStatus: 'NOT_VERIFIED' | null;
  needsReview: boolean;
  failureReason: string | null;
  failureNote: string | null;
}

export interface NonWorkingDay {
  reason: 'HOLIDAY' | 'WEEKDAY';
  label: string;
  weekday: number;
  holiday: { id: string; name: string; type: string } | null;
}

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private scopes: CoordinatorScopeService,
  ) {}

  /** Resolves the Employee record linked to a logged-in User account. */
  private async getEmployeeForUser(userId: string, attendanceAt = new Date()) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { employeeId: true },
    });
    if (!user?.employeeId) {
      throw new BadRequestException('Akun ini belum terhubung ke data karyawan. Hubungi HR.');
    }
    const eventDay = startOfDay(attendanceAt);
    if (eventDay.getTime() >= startOfDay(new Date()).getTime()) {
      await this.activateDuePlacements(user.employeeId, eventDay);
    }
    const employee = await this.prisma.employee.findUnique({
      where: { id: user.employeeId },
      include: {
        placements: { where: { status: { in: ['ACTIVE', 'SCHEDULED', 'ENDED'] } }, include: { location: true }, orderBy: { startDate: 'desc' } },
        temporaryAssignments: { where: { status: 'APPROVED' }, include: { location: true }, orderBy: { startDate: 'desc' } },
      },
    });
    if (!employee) throw new NotFoundException('Data karyawan tidak ditemukan');
    if (employee.deletedAt || (employee.status && !['TRAINING', 'ACTIVE'].includes(employee.status))) {
      throw new BadRequestException('Status karyawan tidak mengizinkan presensi');
    }
    if (!employee.attendanceRequired) {
      throw new BadRequestException('Profil Anda tidak diwajibkan melakukan absensi');
    }

    const today = startOfDay(attendanceAt);
    const activePlacement = employee.placements.find((placement) => placement.startDate <= today && (!placement.endDate || placement.endDate >= today));
    if (!activePlacement) {
      throw new BadRequestException('Karyawan belum memiliki penempatan aktif, tidak dapat absen.');
    }
    const locationId = effectiveWorkLocation(
      activePlacement.locationId,
      attendanceAt,
      employee.temporaryAssignments,
    );
    const location = locationId === activePlacement.locationId
      ? activePlacement.location
      : employee.temporaryAssignments.find((assignment) => assignment.locationId === locationId)?.location;
    if (!location) throw new NotFoundException('Lokasi penugasan sementara tidak ditemukan');
    if (location.deletedAt || location.isActive === false) throw new BadRequestException('Lokasi kerja tidak lagi aktif');
    return { employee, location };
  }

  private async getApprovedFullDayAbsence(employeeId: string, date: Date) {
    return this.prisma.leaveRequest.findFirst({
      where: { employeeId, ...approvedFullDayAbsenceWhere(date) },
      select: { id: true, type: true, startDate: true, endDate: true, status: true },
      orderBy: { startDate: 'desc' },
    });
  }

  private async assertNoApprovedFullDayAbsence(employeeId: string, date: Date) {
    const absence = await this.getApprovedFullDayAbsence(employeeId, date);
    if (absence) {
      throw new BadRequestException('Presensi tidak tersedia pada tanggal cuti, sakit, atau izin tidak masuk yang telah disetujui');
    }
  }

  /**
   * Resolves GPS + selfie evidence for one check-in/out event, honoring the
   * §11.5 MVP policy: if GPS or camera genuinely failed on the device, the
   * employee can still record attendance by declaring the failure — but the
   * record is always flagged NEEDS_REVIEW for HR. GEOFENCE keeps radius as
   * a hard gate; MOBILE requires a GPS fix but does not apply a fixed radius.
   */
  private evaluateEvidence(
    location: { name: string; latitude: number | null; longitude: number | null; radiusMeters: number },
    dto: CheckInDto,
    employeeId: string,
    attendanceMode: 'GEOFENCE' | 'MOBILE' = 'GEOFENCE',
  ): ResolvedEvidence {
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new BadRequestException('Latitude dan longitude harus dikirim bersama');
    }
    const hasCoords = dto.latitude !== undefined && dto.longitude !== undefined;
    const hasSelfie = !!dto.selfieBase64;

    if (attendanceMode === 'GEOFENCE' && (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude))) {
      throw new BadRequestException('Konfigurasi lokasi kerja tidak valid: koordinat geofence belum lengkap');
    }

    const hasCompleteGps = typeof dto.latitude === 'number' && Number.isFinite(dto.latitude)
      && typeof dto.longitude === 'number' && Number.isFinite(dto.longitude);
    if (attendanceMode === 'MOBILE' && !hasCompleteGps) {
      throw new BadRequestException('Mode MOBILE mewajibkan latitude dan longitude lengkap');
    }

    if (!hasCoords || !hasSelfie) {
      if (!dto.failureReason || !dto.failureNote) {
        throw new BadRequestException(
          'GPS atau foto selfie tidak lengkap. Jika perangkat Anda gagal mengambil GPS/kamera, isi alasan (failureReason & failureNote) agar tetap bisa absen dan ditinjau HR.',
        );
      }
    }

    let distance: number | null = null;
    let gpsStatus: ResolvedEvidence['gpsStatus'] = null;
    let needsReview = false;

    if (attendanceMode === 'MOBILE') {
      if (dto.mockLocationDetected) {
        gpsStatus = 'SUSPICIOUS';
        needsReview = true;
      } else {
        gpsStatus = 'OK';
      }
    } else if (hasCoords) {
      if (location.latitude === null || location.longitude === null) {
        gpsStatus = 'UNAVAILABLE';
        needsReview = true;
      } else {
        distance = distanceInMeters(location.latitude, location.longitude, dto.latitude!, dto.longitude!);
        if (distance > location.radiusMeters) {
          throw new BadRequestException('Di luar radius lokasi kerja yang diizinkan');
        }
        // §11.4: never claim certain fake-GPS detection — flag for HR instead of blocking.
        if (dto.mockLocationDetected) {
          gpsStatus = 'SUSPICIOUS';
          needsReview = true;
        } else {
          gpsStatus = 'OK';
        }
      }
    } else {
      gpsStatus = 'FAILED';
      needsReview = true;
    }

    const accuracyLimit = attendanceMode === 'MOBILE' ? 100 : Math.max(50, location.radiusMeters);
    if (hasCompleteGps && (typeof dto.accuracyMeters !== 'number' || dto.accuracyMeters > accuracyLimit)) {
      needsReview = true;
    }

    const selfieUrl = hasSelfie ? saveBase64Image(dto.selfieBase64!, `selfies/${employeeId}`) : null;
    if (!hasSelfie) needsReview = true;

    return {
      distance,
      accuracy: dto.accuracyMeters ?? null,
      geofenceLatitude: attendanceMode === 'MOBILE' ? null : location.latitude,
      geofenceLongitude: attendanceMode === 'MOBILE' ? null : location.longitude,
      geofenceRadiusMeters: attendanceMode === 'MOBILE' ? null : location.radiusMeters,
      locationName: location.name,
      gpsStatus,
      selfieUrl,
      faceStatus: hasSelfie ? 'NOT_VERIFIED' : null, // no vendor integrated yet, §11.5
      needsReview,
      failureReason: !hasCoords || !hasSelfie ? (dto.failureReason ?? null) : null,
      failureNote: !hasCoords || !hasSelfie ? (dto.failureNote ?? null) : null,
    };
  }

  /**
   * Offline attendance (§11.5): if the client captured this while offline
   * and is only syncing now, `clientRecordedAt` is trusted as the real
   * moment it happened (device clock), kept alongside the server receipt
   * time. Always flagged for HR review since the server can't verify a
   * past client-reported timestamp the way it can verify "now".
   */
  private resolveEventTime(clientRecordedAt?: string): { at: Date; clientAt: Date | null; isOffline: boolean } {
    if (!clientRecordedAt) return { at: new Date(), clientAt: null, isOffline: false };
    const parsed = new Date(clientRecordedAt);
    const now = Date.now();
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Waktu rekam offline tidak valid');
    if (parsed.getTime() > now + 5 * 60 * 1000) throw new BadRequestException('Waktu rekam offline tidak boleh berada di masa depan');
    if (parsed.getTime() < now - 7 * 24 * 60 * 60 * 1000) throw new BadRequestException('Data absensi offline lebih dari 7 hari dan tidak dapat diproses');
    return { at: parsed, clientAt: parsed, isOffline: true };
  }

  async checkIn(dto: CheckInDto, actor: AuthenticatedUser) {
    const { at: checkInAt, clientAt, isOffline } = this.resolveEventTime(dto.clientRecordedAt);
    const { employee, location } = await this.getEmployeeForUser(actor.userId, checkInAt);
    const today = startOfDay(checkInAt);
    await this.assertNoApprovedFullDayAbsence(employee.id, today);

    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
    });
    if (existing?.checkInAt) {
      throw new BadRequestException('Sudah melakukan check-in hari ini');
    }

    const evidence = this.evaluateEvidence(location, dto, employee.id, employee.attendanceMode);
    const nonWorkingDay = await this.resolveNonWorkingDay(location, today);
    const latenessStatus = nonWorkingDay ? 'NOT_APPLICABLE' : await this.computeLatenessStatus(location, checkInAt, today);
    const needsReview = evidence.needsReview || !!nonWorkingDay || isOffline;
    const reviewNote = nonWorkingDay
      ? `Check-in pada ${nonWorkingDay.label.toLowerCase()}`
      : null;

    const attendance = await this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
      create: {
        employeeId: employee.id,
        locationId: location.id,
        date: today,
        checkInAt,
        checkInClientRecordedAt: clientAt,
        checkInLatitude: dto.latitude,
        checkInLongitude: dto.longitude,
        checkInAccuracyMeters: evidence.accuracy,
        checkInDistanceMeters: evidence.distance,
        checkInGeofenceLatitude: evidence.geofenceLatitude,
        checkInGeofenceLongitude: evidence.geofenceLongitude,
        checkInGeofenceRadiusMeters: evidence.geofenceRadiusMeters,
        checkInLocationName: evidence.locationName,
        checkInSelfieUrl: evidence.selfieUrl,
        checkInGpsStatus: evidence.gpsStatus,
        checkInFaceStatus: evidence.faceStatus,
        checkInMockLocationFlag: !!dto.mockLocationDetected,
        checkInFailureReason: evidence.failureReason as any,
        checkInFailureNote: evidence.failureNote,
        checkInAttendanceMode: employee.attendanceMode,
        checkInSyncedOffline: isOffline,
        latenessStatus,
        validationStatus: needsReview ? 'NEEDS_REVIEW' : 'VALID',
        payableStatus: needsReview ? 'PENDING_REVIEW' : 'NOT_PAYABLE',
        reviewNote,
      },
      update: {}, // upsert only used as an atomic find-or-create guard; existing rows are rejected above
      include: INCLUDE,
    });

    await this.auditLog.record({
      actorId: actor.userId,
      actorName: actor.name ?? null,
      actorEmail: actor.email,
      action: 'ATTENDANCE_CHECK_IN',
      entity: 'Attendance',
      entityId: attendance.id,
      newValue: { checkInAt, attendanceMode: employee.attendanceMode, gpsStatus: evidence.gpsStatus, distance: evidence.distance, latenessStatus, isOffline },
      actorRole: actor.role,
      source: 'EMPLOYEE',
      reason: evidence.failureNote ?? 'Employee check-in',
    });

    return this.present(attendance);
  }

  async checkOut(dto: CheckOutDto, actor: AuthenticatedUser) {
    const { at: checkOutAt, clientAt, isOffline } = this.resolveEventTime(dto.clientRecordedAt);
    const { employee } = await this.getEmployeeForUser(actor.userId, checkOutAt);
    const today = startOfDay(checkOutAt);
    await this.assertNoApprovedFullDayAbsence(employee.id, today);

    let existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
      include: { location: true },
    });
    if (!existing?.checkInAt) {
      const previousDay = new Date(today);
      previousDay.setDate(previousDay.getDate() - 1);
      const previous = await this.prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId: employee.id, date: previousDay } },
        include: { location: true },
      });
      if (previous?.checkInAt && !previous.checkOutAt) {
        const [hour, minute] = previous.location.checkOutTime.split(':').map(Number);
        const [checkInHour, checkInMinute] = previous.location.checkInTime.split(':').map(Number);
        const scheduledCheckOut = new Date(previous.date);
        scheduledCheckOut.setHours(hour, minute, 0, 0);
        if (hour * 60 + minute <= checkInHour * 60 + checkInMinute) existing = previous;
      }
    }
    if (!existing || !existing.checkInAt) {
      throw new BadRequestException('Belum melakukan check-in hari ini');
    }
    if (existing.checkOutAt) {
      throw new BadRequestException('Sudah melakukan check-out hari ini');
    }
    if (checkOutAt <= existing.checkInAt) {
      throw new BadRequestException('Waktu check-out harus setelah waktu check-in');
    }

    // Uses the same location the check-in was recorded against (not a
    // fresh placement lookup) so a same-day placement change can't
    // silently move where this attendance record is attributed.
    // Every pre-AttendanceMode record used the geofence policy. Keep legacy
    // snapshots null while preserving that known checkout behavior.
    const attendanceMode = existing.checkInAttendanceMode ?? 'GEOFENCE';
    const evidence = this.evaluateEvidence(existing.location, dto, employee.id, attendanceMode);
    const nonWorkingDay = await this.resolveNonWorkingDay(existing.location, existing.date);
    const needsReview = evidence.needsReview || !!nonWorkingDay || isOffline;

    const updated = await this.prisma.attendance.update({
      where: { id: existing.id },
      data: {
        checkOutAt,
        checkOutClientRecordedAt: clientAt,
        checkOutLatitude: dto.latitude,
        checkOutLongitude: dto.longitude,
        checkOutAccuracyMeters: evidence.accuracy,
        checkOutDistanceMeters: evidence.distance,
        checkOutGeofenceLatitude: evidence.geofenceLatitude,
        checkOutGeofenceLongitude: evidence.geofenceLongitude,
        checkOutGeofenceRadiusMeters: evidence.geofenceRadiusMeters,
        checkOutLocationName: evidence.locationName,
        checkOutSelfieUrl: evidence.selfieUrl,
        checkOutGpsStatus: evidence.gpsStatus,
        checkOutFaceStatus: evidence.faceStatus,
        checkOutMockLocationFlag: !!dto.mockLocationDetected,
        checkOutFailureReason: evidence.failureReason as any,
        checkOutFailureNote: evidence.failureNote,
        checkOutAttendanceMode: attendanceMode,
        checkOutSyncedOffline: isOffline,
        validationStatus: needsReview && existing.validationStatus === 'VALID' ? 'NEEDS_REVIEW' : existing.validationStatus,
        payableStatus: payableAttendanceState({
          checkInAt: existing.checkInAt,
          checkOutAt,
          validationStatus: needsReview && existing.validationStatus === 'VALID' ? 'NEEDS_REVIEW' : existing.validationStatus,
          checkOutSource: 'EMPLOYEE',
        }),
        reviewNote: existing.reviewNote ?? (nonWorkingDay
          ? `Presensi pada ${nonWorkingDay.label.toLowerCase()}`
          : null),
        checkOutSource: 'EMPLOYEE',
      },
      include: INCLUDE,
    });

    await this.auditLog.record({
      actorId: actor.userId,
      actorName: actor.name ?? null,
      actorEmail: actor.email,
      action: 'ATTENDANCE_CHECK_OUT',
      entity: 'Attendance',
      entityId: updated.id,
      newValue: { checkOutAt, attendanceMode, gpsStatus: evidence.gpsStatus, distance: evidence.distance, isOffline },
      actorRole: actor.role,
      source: 'EMPLOYEE',
      reason: evidence.failureNote ?? 'Employee check-out',
    });

    return this.present(updated);
  }

  async myToday(actor: AuthenticatedUser) {
    const { employee, location } = await this.getEmployeeForUser(actor.userId);
    const today = startOfDay(new Date());
    const attendance = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
      include: INCLUDE,
    });
    const attendanceMode = attendance?.checkInAt ? (attendance.checkInAttendanceMode ?? 'GEOFENCE') : employee.attendanceMode;
    const nonWorkingDay = await this.resolveNonWorkingDay(location, today);
    const approvedAbsence = await this.getApprovedFullDayAbsence(employee.id, today);
    return { attendance: attendance ? this.present(attendance) : null, attendanceMode, expectedLocation: location, nonWorkingDay, approvedAbsence };
  }

  async myHistory(actor: AuthenticatedUser, query?: QueryMyHistoryDto) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { employeeId: true } });
    if (!user?.employeeId) throw new BadRequestException('Akun ini belum terhubung ke data karyawan');
    const limit = Math.min(Math.max(query?.limit ?? 100, 1), 200);
    const page = Math.max(query?.page ?? 1, 1);
    const records = await this.prisma.attendance.findMany({
      where: { employeeId: user.employeeId },
      include: INCLUDE,
      orderBy: [{ date: 'desc' }, { checkInAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    });
    return records.map((record) => this.present(record));
  }

  async findDetail(id: string, actor: AuthenticatedUser) {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
      include: { ...INCLUDE, reviews: { orderBy: { reviewedAt: 'desc' } } },
    });
    if (!attendance) throw new NotFoundException('Data absensi tidak ditemukan');
    await this.assertMayViewAttendance(attendance, actor);
    const reviewerIds = [...new Set(attendance.reviews.map((review) => review.reviewedById))];
    const reviewers = reviewerIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true, role: true } })
      : [];
    const reviewerById = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer]));
    return this.present({ ...attendance, reviews: attendance.reviews.map((review) => ({ ...review, reviewer: reviewerById.get(review.reviewedById) ?? null })) });
  }

  async findAll(query: QueryAttendanceDto, actor: AuthenticatedUser) {
    const date = query.date ? startOfDay(new Date(query.date)) : startOfDay(new Date());
    const records = await this.prisma.attendance.findMany({
      where: {
        date,
        employeeId: query.employeeId,
        locationId: query.locationId,
        validationStatus: query.validationStatus,
        ...(actor.role === Role.KOORDINATOR ? await this.scopes.queryWhere(actor.userId) : {}),
      },
      include: INCLUDE,
      orderBy: { checkInAt: 'asc' },
    });
    return records.map((record) => this.present(record));
  }

  async monitoring(query: QueryAttendanceMonitoringDto, actor: AuthenticatedUser) {
    const date = query.date ? startOfDay(new Date(query.date)) : startOfDay(new Date());
    const coordinatorScope = actor.role === Role.KOORDINATOR ? await this.scopes.employeeWhere(actor.userId) : {};
    const employees = await this.prisma.employee.findMany({
      where: {
        status: { in: ['TRAINING', 'ACTIVE', 'ON_LEAVE'] },
        joinDate: { lte: date },
        OR: [{ resignDate: null }, { resignDate: { gte: date } }],
        attendanceRequired: true,
        AND: [coordinatorScope, ...(query.employmentType ? [{ employmentType: query.employmentType }] : [])],
        placements: { some: { status: { in: ['ACTIVE', 'SCHEDULED', 'ENDED'] }, startDate: { lte: date }, OR: [{ endDate: null }, { endDate: { gte: date } }], location: { deletedAt: null } } },
      },
      select: {
        id: true, name: true, photoUrl: true, employmentType: true, jobTitle: true, status: true,
        placements: {
          where: { status: { in: ['ACTIVE', 'SCHEDULED', 'ENDED'] }, startDate: { lte: date }, OR: [{ endDate: null }, { endDate: { gte: date } }], location: { deletedAt: null } },
          orderBy: { startDate: 'desc' }, take: 1,
          select: { id: true, startDate: true, endDate: true, locationId: true, location: { select: { id: true, name: true, address: true, checkInTime: true, checkOutTime: true, workDays: true } } },
        },
        temporaryAssignments: {
          where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date }, location: { deletedAt: null } }, orderBy: { startDate: 'desc' },
          select: { id: true, status: true, startDate: true, endDate: true, locationId: true, location: { select: { id: true, name: true, address: true, checkInTime: true, checkOutTime: true, workDays: true } } },
        },
        leaveRequests: {
          where: approvedFullDayAbsenceWhere(date),
          orderBy: { startDate: 'desc' }, take: 1,
          select: { id: true, type: true, startDate: true, endDate: true, status: true },
        },
        attendances: {
          where: { date }, take: 1,
          select: {
            id: true, checkInAt: true, checkOutAt: true, latenessStatus: true, validationStatus: true,
            payableStatus: true, reviewNote: true, reviewedById: true, reviewedAt: true,
            reviews: { orderBy: { reviewedAt: 'desc' }, take: 1, select: { id: true, decision: true, note: true, reviewedById: true, reviewedAt: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const locationIds = new Set<string>();
    for (const employee of employees) {
      const placement = employee.placements[0];
      if (placement) locationIds.add(effectiveWorkLocation(placement.locationId, date, employee.temporaryAssignments));
    }
    const holidays = await this.prisma.holiday.findMany({
      where: { date, OR: [{ locationId: null }, { locationId: { in: [...locationIds] } }] },
      select: { locationId: true },
    });
    const isGlobalHoliday = holidays.some((holiday) => holiday.locationId === null);
    const holidayLocationIds = new Set(holidays.flatMap((holiday) => holiday.locationId ? [holiday.locationId] : []));

    const people = employees.flatMap((employee) => {
      const placement = employee.placements[0];
      if (!placement) return [];
      const effectiveLocationId = effectiveWorkLocation(placement.locationId, date, employee.temporaryAssignments);
      const assignment = employee.temporaryAssignments.find((item) => item.locationId === effectiveLocationId);
      const location = assignment?.location ?? placement.location;
      if (query.locationId && location.id !== query.locationId) return [];
      if (!location.workDays.includes(date.getDay()) || isGlobalHoliday || holidayLocationIds.has(location.id)) return [];

      const attendance = employee.attendances[0] ?? null;
      const approvedLeave = employee.leaveRequests[0] ?? null;
      const state = approvedLeave || employee.status === 'ON_LEAVE'
        ? 'ON_LEAVE'
        : !attendance?.checkInAt ? 'NOT_ATTENDED' : attendance.checkOutAt ? 'CHECKED_OUT' : 'CHECKED_IN';
      return [{
        employee: { id: employee.id, name: employee.name, photoUrl: toProtectedMediaPath(employee.photoUrl), employmentType: employee.employmentType, jobTitle: employee.jobTitle, status: employee.status },
        placement: { id: placement.id, startDate: placement.startDate, endDate: placement.endDate, temporaryAssignmentId: assignment?.id ?? null },
        location: { id: location.id, name: location.name, address: location.address, checkInTime: location.checkInTime, checkOutTime: location.checkOutTime },
        state,
        attendance: attendance ? {
          id: attendance.id, checkInAt: attendance.checkInAt, checkOutAt: attendance.checkOutAt,
          latenessStatus: attendance.latenessStatus, validationStatus: attendance.validationStatus, payableStatus: attendance.payableStatus,
          reviewNote: attendance.reviewNote, reviewedById: attendance.reviewedById, reviewedAt: attendance.reviewedAt,
          latestReview: attendance.reviews[0] ?? null,
        } : null,
        approvedLeave,
      }];
    });

    const onLeave = people.filter((person) => person.state === 'ON_LEAVE').length;
    return {
      date: date.toISOString().slice(0, 10),
      leaveSemantics: 'Approved leave remains in the scheduled roster as ON_LEAVE and is not counted as not attended.',
      summary: {
        totalScheduled: people.length,
        expectedToAttend: people.length - onLeave,
        attended: people.filter((person) => person.state === 'CHECKED_IN' || person.state === 'CHECKED_OUT').length,
        checkedIn: people.filter((person) => person.state === 'CHECKED_IN').length,
        checkedOut: people.filter((person) => person.state === 'CHECKED_OUT').length,
        notAttended: people.filter((person) => person.state === 'NOT_ATTENDED').length,
        onLeave,
        late: people.filter((person) => person.attendance?.latenessStatus === 'LATE').length,
        needsReview: people.filter((person) => person.attendance?.validationStatus === 'NEEDS_REVIEW').length,
      },
      people,
    };
  }

  async reviewAudit() {
    return this.prisma.auditLog.findMany({
      where: { action: { in: ['ATTENDANCE_REVIEW', 'ATTENDANCE_SELF_REVIEW'] } },
      select: {
        id: true, action: true, actorId: true, actorRole: true, entityId: true,
        oldValue: true, newValue: true, reason: true, source: true, relatedEntityId: true, createdAt: true,
        actor: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** §11.5 "Karyawan lupa check-out" — surfaces every open (checked-in but
   * not checked-out) record in a date range so HR can follow up / correct. */
  async findOpen(query: QueryOpenAttendanceDto, actor: AuthenticatedUser) {
    const from = query.fromDate ? startOfDay(new Date(query.fromDate)) : startOfDay(new Date(Date.now() - 30 * 86400000));
    const to = query.toDate ? startOfDay(new Date(query.toDate)) : startOfDay(new Date());

    const records = await this.prisma.attendance.findMany({
      where: {
        date: { gte: from, lte: to },
        checkInAt: { not: null },
        checkOutAt: null,
        ...(actor.role === Role.KOORDINATOR ? await this.scopes.queryWhere(actor.userId) : {}),
      },
      include: INCLUDE,
      orderBy: { date: 'desc' },
    });
    return records.map((record) => this.present(record));
  }

  /** §11.5 "Koreksi absensi" — HR-only manual fix, always requires a reason
   * and is always separately audit-logged (old → new) per §24. */
  async correct(id: string, dto: CorrectAttendanceDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.attendance.findUnique({ where: { id }, include: { location: true } });
    if (!existing) throw new NotFoundException('Data absensi tidak ditemukan');
    if (actor.role === Role.SYSTEM_ADMIN) {
      const user = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { employeeId: true } });
      if (user?.employeeId === existing.employeeId) throw new ForbiddenException('System Admin tidak dapat mengoreksi absensi sendiri');
    }

    const nextCheckInAt = dto.checkInAt ? new Date(dto.checkInAt) : existing.checkInAt;
    const nextCheckOutAt = dto.clearCheckOut ? null : dto.checkOutAt ? new Date(dto.checkOutAt) : existing.checkOutAt;
    if (nextCheckInAt && nextCheckOutAt && nextCheckOutAt <= nextCheckInAt) {
      throw new BadRequestException('Waktu check-out harus setelah check-in');
    }

    const latenessStatus = nextCheckInAt
      ? await this.computeLatenessStatus(existing.location, nextCheckInAt, existing.date)
      : existing.latenessStatus;

    const nextValidationStatus = dto.validationStatus ?? existing.validationStatus;
    const nextCheckOutSource = dto.clearCheckOut ? null : dto.checkOutAt ? 'HR_CORRECTION' : existing.checkOutSource;
    const updated = await this.prisma.attendance.update({
      where: { id },
      data: {
        checkInAt: nextCheckInAt,
        checkOutAt: nextCheckOutAt,
        latenessStatus,
        validationStatus: nextValidationStatus,
        checkOutSource: nextCheckOutSource,
        payableStatus: payableAttendanceState({
          checkInAt: nextCheckInAt,
          checkOutAt: nextCheckOutAt,
          validationStatus: nextValidationStatus,
          checkOutSource: nextCheckOutSource,
        }),
        correctedById: actor.userId,
        correctedAt: new Date(),
        correctionNote: dto.reason,
      },
      include: INCLUDE,
    });

    await this.auditLog.record({
      actorId: actor.userId,
      actorName: actor.name ?? null,
      actorEmail: actor.email,
      action: 'ATTENDANCE_CORRECTION',
      entity: 'Attendance',
      entityId: id,
      oldValue: { checkInAt: existing.checkInAt, checkOutAt: existing.checkOutAt, validationStatus: existing.validationStatus },
      newValue: { checkInAt: nextCheckInAt, checkOutAt: nextCheckOutAt, validationStatus: updated.validationStatus },
      reason: dto.reason,
      actorRole: actor.role,
      source: 'HR_CORRECTION',
    });

    return this.present(updated);
  }

  async review(id: string, dto: ReviewAttendanceDto, actor: AuthenticatedUser) {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
      include: { employee: { select: { id: true, employmentType: true } }, location: true },
    });
    if (!attendance) throw new NotFoundException('Data absensi tidak ditemukan');
    const reviewer = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { employeeId: true } });
    const isSelfReview = reviewer?.employeeId === attendance.employee.id;
    if (isSelfReview && actor.role !== Role.ADMIN_HR) {
      throw new ForbiddenException('Karyawan tidak dapat meninjau absensinya sendiri');
    }
    await this.assertMayReview(attendance.employee, actor);
    if (attendance.validationStatus !== 'NEEDS_REVIEW') {
      throw new BadRequestException('Hanya absensi yang perlu ditinjau yang dapat direview');
    }

    const validationStatus = dto.decision === 'APPROVED' ? 'APPROVED_AFTER_REVIEW' : 'REJECTED';
    const payableStatus = payableAttendanceState({
      checkInAt: attendance.checkInAt,
      checkOutAt: attendance.checkOutAt,
      validationStatus,
      checkOutSource: attendance.checkOutSource,
    });
    const [review, updated] = await this.prisma.$transaction([
      this.prisma.attendanceReview.create({
        data: { attendanceId: id, decision: dto.decision, note: dto.note, reviewedById: actor.userId },
      }),
      this.prisma.attendance.update({
        where: { id },
        data: { validationStatus, payableStatus, reviewNote: dto.note, reviewedById: actor.userId, reviewedAt: new Date() },
        include: INCLUDE,
      }),
    ]);

    await this.auditLog.record({
      actorId: actor.userId,
      actorName: actor.name ?? null,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: isSelfReview ? 'ATTENDANCE_SELF_REVIEW' : 'ATTENDANCE_REVIEW',
      entity: 'Attendance',
      entityId: id,
      oldValue: { validationStatus: attendance.validationStatus, payableStatus: attendance.payableStatus },
      newValue: { reviewId: review.id, decision: dto.decision, validationStatus, payableStatus, selfReview: isSelfReview },
      reason: dto.note,
      source: isSelfReview ? 'ATTENDANCE_SELF_REVIEW' : 'ATTENDANCE_REVIEW',
      relatedEntityId: review.id,
    });
    return this.present(updated);
  }

  async autoCloseForgottenCheckout(id: string, reason: string, actor: AuthenticatedUser) {
    const attendance = await this.prisma.attendance.findUnique({ where: { id }, include: { location: true } });
    if (!attendance) throw new NotFoundException('Data absensi tidak ditemukan');
    if (!attendance.checkInAt || attendance.checkOutAt) throw new BadRequestException('Absensi ini tidak memiliki check-out yang terlupa');

    const [hour, minute] = attendance.location.checkOutTime.split(':').map(Number);
    const checkOutAt = new Date(attendance.date);
    checkOutAt.setHours(hour, minute, 0, 0);
    if (checkOutAt <= attendance.checkInAt) checkOutAt.setDate(checkOutAt.getDate() + 1);
    const updated = await this.prisma.attendance.update({
      where: { id },
      data: {
        checkOutAt,
        checkOutSource: 'SYSTEM_AUTO_CLOSED',
        autoClosedAt: new Date(),
        forgottenCheckout: true,
        validationStatus: 'NEEDS_REVIEW',
        payableStatus: 'PENDING_REVIEW',
        reviewNote: 'Check-out otomatis karena karyawan lupa check-out',
      },
      include: INCLUDE,
    });
    await this.auditLog.record({
      actorId: actor.userId,
      actorName: actor.name ?? null,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'ATTENDANCE_AUTO_CLOSE',
      entity: 'Attendance',
      entityId: id,
      oldValue: { checkOutAt: attendance.checkOutAt, validationStatus: attendance.validationStatus },
      newValue: { checkOutAt, checkOutSource: 'SYSTEM_AUTO_CLOSED', forgottenCheckout: true, payableStatus: 'PENDING_REVIEW' },
      reason,
      source: 'SYSTEM_AUTO_CLOSED',
    });
    return this.present(updated);
  }

  async attention(actor: AuthenticatedUser, limit = 100) {
    const records = await this.prisma.attendance.findMany({
      where: {
        OR: [{ validationStatus: 'NEEDS_REVIEW' }, { forgottenCheckout: true }, { checkInAt: { not: null }, checkOutAt: null }],
        ...(actor.role === Role.KOORDINATOR ? await this.scopes.queryWhere(actor.userId) : {}),
      },
      include: { ...INCLUDE, reviews: { orderBy: { reviewedAt: 'desc' } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return records.map((record) => this.present(record));
  }

  async reviewHistory(id: string, actor: AuthenticatedUser) {
    const attendance = await this.prisma.attendance.findUnique({ where: { id }, include: { employee: { select: { employmentType: true } } } });
    if (!attendance) throw new NotFoundException('Data absensi tidak ditemukan');
    await this.assertMayReview(attendance.employee, actor);
    return this.prisma.attendanceReview.findMany({ where: { attendanceId: id }, orderBy: { reviewedAt: 'desc' } });
  }

  private async assertMayReview(employee: { employmentType: string }, actor: AuthenticatedUser) {
    if (actor.role === Role.KOORDINATOR) { await this.scopes.assertEmployee(actor.userId, employee); return; }
    if (actor.role === Role.ADMIN_HR || actor.role === Role.SYSTEM_ADMIN) return;
    throw new ForbiddenException('Anda tidak berwenang meninjau absensi ini');
  }

  private async assertMayViewAttendance(attendance: { employeeId: string; employee: { employmentType: string } }, actor: AuthenticatedUser) {
    if ([Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.DIREKTUR].includes(actor.role as Role)) return;
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { employeeId: true } });
    if (user?.employeeId === attendance.employeeId) return;
    if (actor.role === Role.KOORDINATOR) {
      await this.scopes.assertEmployee(actor.userId, attendance.employee);
      return;
    }
    throw new ForbiddenException('Anda hanya dapat mengakses detail absensi yang diizinkan');
  }

  // Applies scheduled primary placement only at the date it becomes effective.
  // This preserves history and makes offline attendance resolve by event date.
  private async activateDuePlacements(employeeId: string, date: Date) {
    const due = await this.prisma.placement.findMany({
      where: { employeeId, status: 'SCHEDULED', startDate: { lte: date } },
      orderBy: { startDate: 'asc' },
    });
    for (const scheduled of due) {
      const effectiveStart = startOfDay(scheduled.startDate);
      await this.prisma.$transaction(async (tx) => {
        await tx.placement.updateMany({
          where: { employeeId, status: 'ACTIVE' },
          data: { status: 'ENDED', endDate: new Date(effectiveStart.getTime() - 86400000) },
        });
        await tx.placement.update({
          where: { id: scheduled.id },
          data: { status: scheduled.endDate && startOfDay(scheduled.endDate) < date ? 'ENDED' : 'ACTIVE' },
        });
        await tx.auditLog.create({
          data: { action: 'PLACEMENT_EFFECTIVE_ACTIVATION', entity: 'Placement', entityId: scheduled.id, newValue: { status: 'ACTIVE', effectiveStart }, source: 'SYSTEM_EFFECTIVE_DATING', relatedEntityId: employeeId },
        });
      });
    }
  }

  async summary(dateStr?: string, actor?: AuthenticatedUser) {
    const date = dateStr ? startOfDay(new Date(dateStr)) : startOfDay(new Date());
    const weekday = date.getDay();

    const coordinatorEmployeeWhere = actor?.role === Role.KOORDINATOR ? await this.scopes.employeeWhere(actor.userId) : {};
    const eligibleEmployeeWhere = {
      ...coordinatorEmployeeWhere,
      attendanceRequired: true,
      leaveRequests: { none: approvedFullDayAbsenceWhere(date) },
    };
    const [scheduledToday, records] = await Promise.all([
      // Employees whose active placement's location works on this weekday.
      this.prisma.employee.count({
        where: {
          status: 'ACTIVE',
          attendanceRequired: true,
          ...coordinatorEmployeeWhere,
          leaveRequests: { none: approvedFullDayAbsenceWhere(date) },
          placements: { some: { status: 'ACTIVE', location: { workDays: { has: weekday } } } },
        },
      }),
      this.prisma.attendance.findMany({
        where: { date, employee: eligibleEmployeeWhere },
        select: { checkInAt: true, latenessStatus: true, validationStatus: true },
      }),
    ]);

    const hadir = records.filter((r) => r.checkInAt).length;
    const terlambat = records.filter((r) => r.latenessStatus === 'LATE').length;
    const perluDitinjau = records.filter((r) => r.validationStatus === 'NEEDS_REVIEW').length;

    return {
      date: date.toISOString().slice(0, 10),
      hadir,
      terlambat,
      tidakHadir: Math.max(scheduledToday - hadir, 0),
      perluDitinjau,
    };
  }

  private async computeLatenessStatus(
    location: { id: string; checkInTime: string; toleranceMin: number; workDays: number[] },
    checkInAt: Date,
    date: Date,
  ): Promise<'ON_TIME' | 'LATE' | 'NOT_APPLICABLE'> {
    const weekday = date.getDay();
    if (!location.workDays.includes(weekday)) return 'NOT_APPLICABLE';

    const holiday = await this.prisma.holiday.findFirst({
      where: { date, OR: [{ locationId: null }, { locationId: location.id }] },
    });
    if (holiday) return 'NOT_APPLICABLE';

    const [h, m] = location.checkInTime.split(':').map(Number);
    const deadline = new Date(date);
    deadline.setHours(h, m + location.toleranceMin, 0, 0);

    return checkInAt.getTime() <= deadline.getTime() ? 'ON_TIME' : 'LATE';
  }

  private async resolveNonWorkingDay(
    location: { id: string; workDays: number[] },
    date: Date,
  ): Promise<NonWorkingDay | null> {
    const weekday = date.getDay();
    const holiday = await this.prisma.holiday.findFirst({
      where: { date, OR: [{ locationId: null }, { locationId: location.id }] },
      select: { id: true, name: true, type: true },
      orderBy: { locationId: 'desc' },
    });
    if (holiday) return { reason: 'HOLIDAY', label: `Hari libur: ${holiday.name}`, weekday, holiday };
    if (!location.workDays.includes(weekday)) return { reason: 'WEEKDAY', label: 'Akhir pekan / hari kerja tidak terjadwal', weekday, holiday: null };
    return null;
  }

  private present<T extends { checkInSelfieUrl?: string | null; checkOutSelfieUrl?: string | null }>(attendance: T): T {
    return {
      ...attendance,
      checkInSelfieUrl: toProtectedMediaPath(attendance.checkInSelfieUrl),
      checkOutSelfieUrl: toProtectedMediaPath(attendance.checkOutSelfieUrl),
    };
  }
}
