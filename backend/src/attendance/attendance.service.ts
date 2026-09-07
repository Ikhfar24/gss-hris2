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
import { QueryAttendanceDto, QueryOpenAttendanceDto } from './dto/query-attendance.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { ResetDeviceDto } from './dto/reset-device.dto';
import { ReviewAttendanceDto } from './dto/review-attendance.dto';
import { CoordinatorScopeService } from '../coordinator-scopes/coordinator-scope.service';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const INCLUDE = {
  employee: { select: { id: true, name: true, employmentType: true } },
  location: { select: { id: true, name: true, radiusMeters: true } },
};

interface ResolvedEvidence {
  distance: number | null;
  accuracy: number | null;
  geofenceLatitude: number | null;
  geofenceLongitude: number | null;
  geofenceRadiusMeters: number;
  locationName: string;
  gpsStatus: 'OK' | 'OUT_OF_RADIUS' | 'UNAVAILABLE' | 'SUSPICIOUS' | 'FAILED' | null;
  selfieUrl: string | null;
  faceStatus: 'NOT_VERIFIED' | null;
  needsReview: boolean;
  failureReason: string | null;
  failureNote: string | null;
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
        placements: { where: { status: { in: ['ACTIVE', 'SCHEDULED'] } }, include: { location: true }, orderBy: { startDate: 'desc' } },
        temporaryAssignments: { where: { status: 'APPROVED' }, include: { location: true }, orderBy: { startDate: 'desc' } },
      },
    });
    if (!employee) throw new NotFoundException('Data karyawan tidak ditemukan');
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
    return { employee, location };
  }

  /**
   * Device binding (§11.5): one bound device per employee. First
   * successful check-in self-registers the device. A different device
   * afterwards is hard-rejected — HR must reset the binding (e.g. new
   * phone) via resetDevice(). This binds a browser/app install (an opaque
   * client-generated id), not real hardware — see README for that caveat.
   */
  private async enforceDeviceBinding(employeeId: string, deviceId: string, deviceLabel?: string) {
    const existing = await this.prisma.employeeDevice.findUnique({ where: { employeeId } });

    if (!existing) {
      await this.prisma.employeeDevice.create({
        data: { employeeId, deviceId, label: deviceLabel ?? null },
      });
      return;
    }

    if (existing.deviceId !== deviceId) {
      throw new ForbiddenException(
        'Perangkat ini tidak dikenali untuk akun Anda. Hubungi HR untuk reset perangkat jika Anda berganti HP.',
      );
    }

    await this.prisma.employeeDevice.update({
      where: { employeeId },
      data: { lastUsedAt: new Date(), label: deviceLabel ?? existing.label },
    });
  }

  /**
   * Resolves GPS + selfie evidence for one check-in/out event, honoring the
   * §11.5 MVP policy: if GPS or camera genuinely failed on the device, the
   * employee can still record attendance by declaring the failure — but the
   * record is always flagged NEEDS_REVIEW for HR. Being inside the radius
   * is still a hard gate whenever coordinates ARE present.
   */
  private evaluateEvidence(
    location: { name: string; latitude: number | null; longitude: number | null; radiusMeters: number },
    dto: CheckInDto,
    employeeId: string,
  ): ResolvedEvidence {
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new BadRequestException('Latitude dan longitude harus dikirim bersama');
    }
    const hasCoords = dto.latitude !== undefined && dto.longitude !== undefined;
    const hasSelfie = !!dto.selfieBase64;

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

    if (hasCoords) {
      if (location.latitude === null || location.longitude === null) {
        gpsStatus = 'UNAVAILABLE';
        needsReview = true;
      } else {
        distance = distanceInMeters(location.latitude, location.longitude, dto.latitude!, dto.longitude!);
        if (distance > location.radiusMeters) {
          throw new BadRequestException(
            `Di luar radius lokasi kerja: jarak ${Math.round(distance)}m, maksimum ${location.radiusMeters}m`,
          );
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

    const selfieUrl = hasSelfie ? saveBase64Image(dto.selfieBase64!, `selfies/${employeeId}`) : null;
    if (!hasSelfie) needsReview = true;

    return {
      distance,
      accuracy: dto.accuracyMeters ?? null,
      geofenceLatitude: location.latitude,
      geofenceLongitude: location.longitude,
      geofenceRadiusMeters: location.radiusMeters,
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
    return { at: parsed, clientAt: parsed, isOffline: true };
  }

  async checkIn(dto: CheckInDto, actor: AuthenticatedUser) {
    const { at: checkInAt, clientAt, isOffline } = this.resolveEventTime(dto.clientRecordedAt);
    const { employee, location } = await this.getEmployeeForUser(actor.userId, checkInAt);
    await this.enforceDeviceBinding(employee.id, dto.deviceId, dto.deviceInfo);
    const today = startOfDay(checkInAt);

    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
    });
    if (existing?.checkInAt) {
      throw new BadRequestException('Sudah melakukan check-in hari ini');
    }

    const evidence = this.evaluateEvidence(location, dto, employee.id);
    const latenessStatus = await this.computeLatenessStatus(location, checkInAt, today);
    const isOffWorkDay = !location.workDays.includes(checkInAt.getDay());
    const needsReview = evidence.needsReview || isOffWorkDay || isOffline;

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
        checkInDeviceInfo: dto.deviceInfo,
        checkInDeviceId: dto.deviceId,
        checkInFailureReason: evidence.failureReason as any,
        checkInFailureNote: evidence.failureNote,
        checkInSyncedOffline: isOffline,
        latenessStatus,
        validationStatus: needsReview ? 'NEEDS_REVIEW' : 'VALID',
        payableStatus: needsReview ? 'PENDING_REVIEW' : 'NOT_PAYABLE',
        reviewNote: isOffWorkDay ? 'Check-in di luar hari kerja terjadwal lokasi ini' : null,
      },
      update: {}, // upsert only used as an atomic find-or-create guard; existing rows are rejected above
      include: INCLUDE,
    });

    await this.auditLog.record({
      actorId: actor.userId,
      action: 'ATTENDANCE_CHECK_IN',
      entity: 'Attendance',
      entityId: attendance.id,
      newValue: { checkInAt, gpsStatus: evidence.gpsStatus, distance: evidence.distance, latenessStatus, isOffline },
      actorRole: actor.role,
      source: 'EMPLOYEE',
      reason: evidence.failureNote ?? 'Employee check-in',
    });

    return this.present(attendance);
  }

  async checkOut(dto: CheckOutDto, actor: AuthenticatedUser) {
    const { at: checkOutAt, clientAt, isOffline } = this.resolveEventTime(dto.clientRecordedAt);
    const { employee } = await this.getEmployeeForUser(actor.userId, checkOutAt);
    await this.enforceDeviceBinding(employee.id, dto.deviceId, dto.deviceInfo);
    const today = startOfDay(checkOutAt);

    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
      include: { location: true },
    });
    if (!existing || !existing.checkInAt) {
      throw new BadRequestException('Belum melakukan check-in hari ini');
    }
    if (existing.checkOutAt) {
      throw new BadRequestException('Sudah melakukan check-out hari ini');
    }

    // Uses the same location the check-in was recorded against (not a
    // fresh placement lookup) so a same-day placement change can't
    // silently move where this attendance record is attributed.
    const evidence = this.evaluateEvidence(existing.location, dto, employee.id);
    const needsReview = evidence.needsReview || isOffline;

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
        checkOutDeviceInfo: dto.deviceInfo,
        checkOutDeviceId: dto.deviceId,
        checkOutFailureReason: evidence.failureReason as any,
        checkOutFailureNote: evidence.failureNote,
        checkOutSyncedOffline: isOffline,
        validationStatus: needsReview && existing.validationStatus === 'VALID' ? 'NEEDS_REVIEW' : existing.validationStatus,
        payableStatus: payableAttendanceState({
          checkInAt: existing.checkInAt,
          checkOutAt,
          validationStatus: needsReview && existing.validationStatus === 'VALID' ? 'NEEDS_REVIEW' : existing.validationStatus,
          checkOutSource: 'EMPLOYEE',
        }),
        checkOutSource: 'EMPLOYEE',
      },
      include: INCLUDE,
    });

    await this.auditLog.record({
      actorId: actor.userId,
      action: 'ATTENDANCE_CHECK_OUT',
      entity: 'Attendance',
      entityId: updated.id,
      newValue: { checkOutAt, gpsStatus: evidence.gpsStatus, distance: evidence.distance, isOffline },
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
    return { attendance: attendance ? this.present(attendance) : null, expectedLocation: location };
  }

  async myHistory(actor: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { employeeId: true } });
    if (!user?.employeeId) throw new BadRequestException('Akun ini belum terhubung ke data karyawan');
    const records = await this.prisma.attendance.findMany({
      where: { employeeId: user.employeeId },
      include: INCLUDE,
      orderBy: [{ date: 'desc' }, { checkInAt: 'desc' }],
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
    if (reviewer?.employeeId === attendance.employee.id) {
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
      actorRole: actor.role,
      action: 'ATTENDANCE_REVIEW',
      entity: 'Attendance',
      entityId: id,
      oldValue: { validationStatus: attendance.validationStatus, payableStatus: attendance.payableStatus },
      newValue: { reviewId: review.id, decision: dto.decision, validationStatus, payableStatus },
      reason: dto.note,
      source: 'ATTENDANCE_REVIEW',
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

  async attention(actor: AuthenticatedUser) {
    const records = await this.prisma.attendance.findMany({
      where: {
        OR: [{ validationStatus: 'NEEDS_REVIEW' }, { forgottenCheckout: true }, { checkInAt: { not: null }, checkOutAt: null }],
        ...(actor.role === Role.KOORDINATOR ? await this.scopes.queryWhere(actor.userId) : {}),
      },
      include: { ...INCLUDE, reviews: { orderBy: { reviewedAt: 'desc' } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
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
    if (actor.role === Role.KOORDINATOR) {
      await this.scopes.assertEmployee(actor.userId, attendance.employee);
      return;
    }
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { employeeId: true } });
    if (user?.employeeId === attendance.employeeId) return;
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
    const coordinatorQueryWhere = actor?.role === Role.KOORDINATOR ? { employee: coordinatorEmployeeWhere } : {};
    const [scheduledToday, records] = await Promise.all([
      // Employees whose active placement's location works on this weekday.
      this.prisma.employee.count({
        where: {
          status: 'ACTIVE',
          ...coordinatorEmployeeWhere,
          placements: { some: { status: 'ACTIVE', location: { workDays: { has: weekday } } } },
        },
      }),
      this.prisma.attendance.findMany({
        where: { date, ...coordinatorQueryWhere },
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

  // --- Device binding management (§11.5) ---------------------------------

  async listDevices() {
    return this.prisma.employeeDevice.findMany({
      include: { employee: { select: { id: true, name: true } } },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async resetDevice(employeeId: string, dto: ResetDeviceDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.employeeDevice.findUnique({ where: { employeeId } });
    if (!existing) throw new NotFoundException('Karyawan ini belum punya perangkat terikat');

    await this.prisma.employeeDevice.delete({ where: { employeeId } });

    await this.auditLog.record({
      actorId: actor.userId,
      action: 'DEVICE_RESET',
      entity: 'EmployeeDevice',
      entityId: employeeId,
      oldValue: { deviceId: existing.deviceId, label: existing.label },
      reason: dto.reason,
      actorRole: actor.role,
      source: 'DEVICE_MANAGEMENT',
    });

    return { reset: true };
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

  private present<T extends { checkInSelfieUrl?: string | null; checkOutSelfieUrl?: string | null }>(attendance: T): T {
    return {
      ...attendance,
      checkInSelfieUrl: toProtectedMediaPath(attendance.checkInSelfieUrl),
      checkOutSelfieUrl: toProtectedMediaPath(attendance.checkOutSelfieUrl),
    };
  }
}
