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
import { CoordinatorScopeService } from '../coordinator-scopes/coordinator-scope.service';
import { saveImageBuffer } from '../common/utils/file-storage.util';
import { buildImportTemplate, parseImportXlsx, ParsedXlsxRow, XlsxImportColumn, XlsxUpload } from '../common/utils/xlsx-import.util';
import * as bcrypt from 'bcrypt';
import { isEmail } from 'class-validator';
import { normalizeReferenceCode } from '../common/utils/reference-code.util';
import { TemporaryCredentialService } from '../temporary-credentials/temporary-credential.service';

const SUMMARY_INCLUDE = {
  user: { select: { id: true, email: true, role: true, isActive: true } },
  placements: { where: { status: 'ACTIVE' as const }, include: { location: { select: { id: true, referenceCode: true, name: true, clientId: true } } } },
  contracts: { where: { status: 'ACTIVE' as const }, orderBy: { startDate: 'desc' as const }, take: 1 },
};
const SENSITIVE_FIELDS = new Set(['nik', 'employeeNumber', 'bankAccountNumber', 'bpjsKesehatanNumber', 'bpjsKetenagakerjaanNumber', 'employmentType', 'status', 'attendanceRequired', 'attendanceExemptionReason', 'attendanceMode', 'joinDate']);
const EMPLOYEE_IMPORT_COLUMNS: XlsxImportColumn[] = [
  { key: 'name', type: 'string', required: true, description: 'Nama lengkap karyawan', example: 'Budi Santoso' },
  { key: 'nik', type: 'string', description: 'NIK adalah Nomor Induk Kependudukan, bukan NIP. Format kolom sebagai teks agar 16 digit dan nol di depan tidak berubah.', example: '3301010101950001' },
  { key: 'employeeNumber', type: 'string', description: 'NIP adalah nomor karyawan internal perusahaan, bukan NIK. Format sebagai teks agar nol di depan tetap tersimpan.', example: 'EMP-001' },
  { key: 'phone', type: 'string', description: 'Nomor telepon / WhatsApp', example: '081234567890' },
  { key: 'address', type: 'string', description: 'Alamat tempat tinggal', example: 'Jl. Jenderal Sudirman No. 10, Purwokerto' },
  { key: 'email', type: 'string', description: 'Email karyawan. Ini data kontak dan tidak otomatis membuat akun login.', example: 'budi.santoso@example.com' },
  { key: 'dateOfBirth', type: 'date', description: 'Tanggal lahir dengan format YYYY-MM-DD', example: '1995-05-17' },
  { key: 'gender', type: 'string', description: 'Jenis kelamin', example: 'MALE', allowedValues: ['MALE', 'FEMALE'] },
  { key: 'bankAccountNumber', type: 'string', description: 'Nomor rekening bank untuk administrasi payroll; tulis sebagai teks.', example: '1234567890' },
  { key: 'bpjsKesehatanNumber', type: 'string', description: 'Nomor kepesertaan BPJS Kesehatan; tulis sebagai teks.', example: '0001234567890' },
  { key: 'bpjsKetenagakerjaanNumber', type: 'string', description: 'Nomor kepesertaan BPJS Ketenagakerjaan; tulis sebagai teks.', example: '12345678901' },
  { key: 'jobTitle', type: 'string', description: 'Jabatan karyawan', example: 'Arsiparis' },
  { key: 'photoUrl', type: 'string', description: 'URL/path foto profil yang sudah tersedia di aplikasi. Kosongkan jika belum ada.', example: '/api/v1/media/profile-photos/employee-id/foto.jpg' },
  { key: 'employmentType', type: 'string', required: true, description: 'Jenis kepegawaian: TENAGA_BORONGAN = Tenaga Borongan; TENAGA_ARSIPARIS = Tenaga Arsiparis; STAFF_OFFICE = Staff Kantor.', example: 'TENAGA_ARSIPARIS', allowedValues: ['TENAGA_BORONGAN', 'TENAGA_ARSIPARIS', 'STAFF_OFFICE'] },
  { key: 'status', type: 'string', description: 'Status awal karyawan. Jika kosong, sistem menggunakan TRAINING.', example: 'ACTIVE', allowedValues: ['TRAINING', 'ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED'] },
  { key: 'joinDate', type: 'date', required: true, description: 'Tanggal bergabung dengan format YYYY-MM-DD', example: '2026-09-01' },
  { key: 'trainingEndDate', type: 'date', description: 'Tanggal akhir masa training dengan format YYYY-MM-DD. Kosongkan jika tidak berlaku.', example: '2026-11-30' },
  { key: 'coordinatorId', type: 'string', description: 'ID koordinator yang sudah terdaftar. Gunakan ID yang diberikan administrator aplikasi; kosongkan jika tidak berlaku.', example: 'coordinator-user-id' },
  { key: 'dailyRate', type: 'integer', description: 'Upah harian; digunakan bila relevan untuk Tenaga Borongan', example: 150000 },
  { key: 'initialLocationReference', aliases: ['initialLocationId'], type: 'string', description: 'referenceCode Lokasi untuk penempatan awal. Workbook lama boleh memakai header initialLocationId dan nilai ID internal lama.', example: 'LOC-PURWOKERTO' },
  { key: 'attendanceRequired', type: 'boolean', description: 'TRUE jika karyawan wajib presensi; FALSE jika dikecualikan. Jika kosong, default TRUE.', example: true, allowedValues: [true, false] },
  { key: 'attendanceExemptionReason', type: 'string', description: 'Alasan pengecualian presensi. Wajib diisi ketika attendanceRequired=FALSE.', example: 'Direktur tidak diwajibkan presensi harian' },
  { key: 'attendanceMode', type: 'string', description: 'GEOFENCE mewajibkan GPS berada dalam radius lokasi kerja. MOBILE mewajibkan GPS aktif tetapi tidak membatasi radius. Jika kosong, default GEOFENCE.', example: 'GEOFENCE', allowedValues: ['GEOFENCE', 'MOBILE'] },
  { key: 'provisionUser', type: 'boolean', description: 'TRUE membuat akun login dalam transaksi import yang sama; FALSE hanya membuat data Employee.', example: false, allowedValues: [true, false] },
  { key: 'loginEmail', type: 'string', description: 'Email login. Wajib, valid, dan unik ketika provisionUser=TRUE.', example: 'budi.santoso@example.com' },
  { key: 'userRole', type: 'string', description: 'Role mengatur kewenangan aplikasi dan terpisah dari Employment Type. Wajib ketika provisionUser=TRUE. SYSTEM_ADMIN hanya dapat ditetapkan oleh System Admin.', example: 'KARYAWAN', allowedValues: Object.values(Role) },
];

type EmployeeXlsxRow = Omit<CreateEmployeeDto, 'initialLocationId'> & { initialLocationReference?: string; initialLocationId?: string; provisionUser?: boolean; loginEmail?: string; userRole?: Role } & Record<string, unknown>;

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService, private scopes: CoordinatorScopeService, private temporaryCredentials: TemporaryCredentialService) {}

  async findAll(actor: AuthenticatedUser, query: any = {}) {
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 25, 1), 100);
    const where: any = {
      deletedAt: null,
      ...(actor.role === Role.KOORDINATOR ? await this.scopes.employeeWhere(actor.userId) : {}),
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
    const employee = await this.prisma.employee.findUnique({ where: { id }, include: { ...SUMMARY_INCLUDE, contracts: { orderBy: { startDate: 'desc' } }, placements: { include: { location: { select: { id: true, referenceCode: true, name: true, clientId: true } } }, orderBy: { startDate: 'desc' } } } });
    if (!employee || employee.deletedAt) throw new NotFoundException('Karyawan tidak ditemukan');
    await this.assertEmployeeScope(employee, actor);
    return this.present(employee, actor);
  }

  async find360(id: string, actor: AuthenticatedUser) {
    const employee = await this.prisma.employee.findUnique({ where: { id }, include: {
      user: { select: { id: true } },
      placements: { orderBy: { startDate: 'desc' }, include: { location: { select: { id: true, referenceCode: true, name: true, clientId: true } } } },
      contracts: { orderBy: { startDate: 'desc' } },
      attendances: { orderBy: { date: 'desc' }, take: 30, select: { id: true, date: true, checkInAt: true, checkOutAt: true, latenessStatus: true, validationStatus: true, payableStatus: true, location: { select: { id: true, name: true } } } },
      leaveRequests: { orderBy: { requestedAt: 'desc' }, take: 20, select: { id: true, type: true, startDate: true, endDate: true, status: true, requestedAt: true, reviewedAt: true } },
      temporaryAssignments: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, startDate: true, endDate: true, status: true, reason: true, location: { select: { id: true, name: true } } } },
      absenceCases: { orderBy: { date: 'desc' }, take: 20, select: { id: true, date: true, status: true, note: true, createdAt: true } },
      overtimeRequests: { orderBy: { date: 'desc' }, take: 20, select: { id: true, date: true, startTime: true, endTime: true, status: true, reason: true, requestedAt: true } },
      profileChangeRequests: { orderBy: { requestedAt: 'desc' }, take: 20, select: { id: true, status: true, requestedAt: true, reviewedAt: true, reviewNote: true } },
    } });
    if (!employee || employee.deletedAt) throw new NotFoundException('Karyawan tidak ditemukan');
    await this.assertEmployeeScope(employee, actor);
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

  async find360ByUserId(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user?.employeeId) throw new NotFoundException('Akun ini belum terhubung ke data karyawan');
    return this.find360(user.employeeId, { userId, email: '', role: Role.KARYAWAN });
  }

  async manpower() {
    return this.prisma.employee.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, employeeNumber: true, employmentType: true, status: true, jobTitle: true, placements: { where: { status: 'ACTIVE' }, select: { location: { select: { id: true, name: true, clientId: true } } } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateEmployeeDto, actor: AuthenticatedUser) {
    this.assertMayConfigureAttendanceMode(dto.attendanceMode, actor);
    this.validateAttendanceEligibility(dto.attendanceRequired, dto.attendanceExemptionReason);
    await this.assertIdentityUnique(dto.nik, dto.employeeNumber);
    const { initialLocationId, joinDate, trainingEndDate, dateOfBirth, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          ...rest, joinDate: new Date(joinDate), trainingEndDate: trainingEndDate ? new Date(trainingEndDate) : null, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          placements: initialLocationId ? { create: { locationId: initialLocationId, startDate: new Date(joinDate), status: 'ACTIVE' } } : undefined,
        } as any, include: SUMMARY_INCLUDE,
      });
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'EMPLOYEE_CREATE', entity: 'Employee', entityId: employee.id, newValue: this.auditProjection(employee) as any, source: 'EMPLOYEE_MANAGEMENT' } });
      return this.present(employee, actor);
    });
  }

  async update(id: string, dto: UpdateEmployeeDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction((tx) => this.updateWithClient(tx, id, dto, actor));
  }

  async updateProfilePhoto(id: string, file: { buffer: Buffer; mimetype: string } | undefined, actor: AuthenticatedUser) {
    if (actor.role !== Role.ADMIN_HR) throw new ForbiddenException('Hanya Admin HR yang dapat mengubah foto profil karyawan');
    if (!file) throw new BadRequestException('File foto profil wajib diunggah');
    const employee = await this.prisma.employee.findUnique({ where: { id }, select: { id: true, photoUrl: true } });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
    const photoUrl = saveImageBuffer(file.buffer, file.mimetype, `profile-photos/${id}`);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({ where: { id }, data: { photoUrl }, include: SUMMARY_INCLUDE });
      await tx.auditLog.create({ data: {
        actorId: actor.userId, actorRole: Role.ADMIN_HR,
        action: employee.photoUrl ? 'EMPLOYEE_PROFILE_PHOTO_REPLACE' : 'EMPLOYEE_PROFILE_PHOTO_UPLOAD',
        entity: 'Employee', entityId: id,
        oldValue: { hasPhoto: !!employee.photoUrl }, newValue: { hasPhoto: true },
        source: 'EMPLOYEE_PROFILE_PHOTO', relatedEntityId: id,
      } });
      return this.present(updated, actor);
    });
  }

  async import(dto: ImportEmployeesDto, actor: AuthenticatedUser) {
    if (dto.rows.some((row) => row.attendanceMode !== undefined)) this.assertMayConfigureAttendanceMode('GEOFENCE', actor);
    const errors: { row: number; errors: string[] }[] = [];
    const seenNik = new Set<string>();
    const seenEmployeeNumber = new Set<string>();
    const identities = dto.rows.flatMap((row) => [row.nik, row.employeeNumber].filter((value): value is string => !!value));
    const existing = identities.length ? await this.prisma.employee.findMany({ where: { OR: [{ nik: { in: identities } }, { employeeNumber: { in: identities } }] }, select: { nik: true, employeeNumber: true } }) : [];
    const existingNik = new Set(existing.map((employee) => employee.nik).filter(Boolean));
    const existingEmployeeNumber = new Set(existing.map((employee) => employee.employeeNumber).filter(Boolean));
    const locationIds = [...new Set(dto.rows.map((row) => row.initialLocationId).filter((value): value is string => !!value))];
    const locations = locationIds.length ? await this.prisma.location.findMany({ where: { id: { in: locationIds }, deletedAt: null, isActive: true }, select: { id: true } }) : [];
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
        } as any, select: { id: true } }));
      }
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'EMPLOYEE_IMPORT', entity: 'Employee', newValue: { rowCount: records.length }, source: 'EMPLOYEE_IMPORT' } });
      return records;
    });
    return { dryRun: false, valid: true, created: created.length, errors: [] };
  }

  importTemplate() {
    return buildImportTemplate('Employees', EMPLOYEE_IMPORT_COLUMNS);
  }

  async previewXlsxImport(file: XlsxUpload) {
    const rows = await parseImportXlsx<EmployeeXlsxRow>(file, EMPLOYEE_IMPORT_COLUMNS);
    return this.validateXlsxRows(rows);
  }

  async commitXlsxImport(file: XlsxUpload, actor: AuthenticatedUser) {
    const preview = await this.previewXlsxImport(file);
    if (!preview.valid) throw new BadRequestException({ message: 'Import karyawan gagal divalidasi', ...preview });
    for (const row of preview.rows) {
      this.assertMayConfigureAttendanceMode(row.data.attendanceMode, actor);
      if (row.data.userRole === Role.SYSTEM_ADMIN && actor.role !== Role.SYSTEM_ADMIN) {
        throw new ForbiddenException('Hanya System Admin yang dapat menyediakan akun System Admin');
      }
    }

    const provisioning = await Promise.all(preview.rows.map(async (row) => {
      if (!row.data.provisionUser) return null;
      const temporaryPassword = this.temporaryCredentials.generatePassword();
      return { row: row.row, temporaryPassword, passwordHash: await bcrypt.hash(temporaryPassword, 10) };
    }));
    const provisioningByRow = new Map(provisioning.filter((item): item is NonNullable<typeof item> => !!item).map((item) => [item.row, item]));

    const result = await this.prisma.$transaction(async (tx) => {
      const records: { id: string; name: string; userId?: string }[] = [];
      const credentials: { employeeId: string; name: string; email: string; role: Role; temporaryPassword: string }[] = [];
      for (const row of preview.rows) {
        const { initialLocationId, joinDate, trainingEndDate, dateOfBirth, provisionUser, loginEmail, userRole, ...data } = row.data;
        const employee = await tx.employee.create({ data: {
          ...data,
          joinDate: new Date(joinDate),
          trainingEndDate: trainingEndDate ? new Date(trainingEndDate) : null,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          placements: initialLocationId ? { create: { locationId: initialLocationId, startDate: new Date(joinDate), status: 'ACTIVE' } } : undefined,
        } as any, select: { id: true, name: true } });
        const provision = provisioningByRow.get(row.row);
        let userId: string | undefined;
        if (provisionUser && loginEmail && userRole && provision) {
          const user = await tx.user.create({ data: { employeeId: employee.id, name: employee.name, email: loginEmail.toLowerCase(), role: userRole, passwordHash: provision.passwordHash, mustChangePassword: true }, select: { id: true } });
          await this.temporaryCredentials.store(tx, user.id, provision.temporaryPassword, 'EMPLOYEE_IMPORT', actor.userId);
          userId = user.id;
          credentials.push({ employeeId: employee.id, name: employee.name, email: loginEmail.toLowerCase(), role: userRole, temporaryPassword: provision.temporaryPassword });
        }
        records.push({ ...employee, userId });
      }
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'EMPLOYEE_XLSX_IMPORT', entity: 'Employee', newValue: { rowCount: records.length, provisionedUserCount: credentials.length }, source: 'EMPLOYEE_IMPORT' } });
      return { records, credentials };
    });
    return { valid: true, created: result.records.length, provisionedUsers: result.credentials.length, records: result.records, credentials: result.credentials, errors: [] };
  }

  private async validateXlsxRows(rows: ParsedXlsxRow<EmployeeXlsxRow>[]) {
    const identities = rows.flatMap(({ data }) => [data.nik, data.employeeNumber].filter((value): value is string => typeof value === 'string' && !!value));
    const locationReferences = [...new Set(rows.map(({ data }) => data.initialLocationReference).filter((value): value is string => typeof value === 'string' && !!value))];
    const normalizedLocationReferences = locationReferences.map(normalizeReferenceCode);
    const loginEmails = rows.map(({ data }) => data.loginEmail).filter((value): value is string => typeof value === 'string' && !!value).map((email) => email.toLowerCase());
    const [employees, locations, users] = await Promise.all([
      identities.length ? this.prisma.employee.findMany({ where: { OR: [{ nik: { in: identities } }, { employeeNumber: { in: identities } }] }, select: { nik: true, employeeNumber: true } }) : [],
      locationReferences.length ? this.prisma.location.findMany({ where: { deletedAt: null, isActive: true, OR: [{ referenceCode: { in: normalizedLocationReferences } }, { id: { in: locationReferences } }] }, select: { id: true, referenceCode: true } }) : [],
      loginEmails.length ? this.prisma.user.findMany({ where: { email: { in: loginEmails, mode: 'insensitive' } }, select: { email: true } }) : [],
    ]);
    const existingNik = new Set(employees.map((employee) => employee.nik).filter((value): value is string => !!value));
    const existingEmployeeNumber = new Set(employees.map((employee) => employee.employeeNumber).filter((value): value is string => !!value));
    const locationsByCode = new Map<string, string>(locations.flatMap((location) => typeof location.referenceCode === 'string' ? [[normalizeReferenceCode(location.referenceCode), location.id] as [string, string]] : []));
    const locationIds = new Set(locations.map((location) => location.id));
    const existingEmails = new Set(users.map((user) => user.email.toLowerCase()));
    const seenNik = new Set<string>();
    const seenEmployeeNumber = new Set<string>();
    const seenEmail = new Set<string>();

    for (const row of rows) {
      const initialLocationReference = row.data.initialLocationReference;
      const initialLocationId = initialLocationReference ? locationsByCode.get(normalizeReferenceCode(initialLocationReference)) ?? (locationIds.has(initialLocationReference) ? initialLocationReference : undefined) : undefined;
      const controls = { provisionUser: row.data.provisionUser, loginEmail: row.data.loginEmail?.trim(), userRole: row.data.userRole };
      const employeeData = { ...row.data };
      delete employeeData.initialLocationReference;
      employeeData.initialLocationId = initialLocationId;
      delete employeeData.provisionUser;
      delete employeeData.loginEmail;
      delete employeeData.userRole;
      const dto = plainToInstance(CreateEmployeeDto, employeeData);
      row.errors.push(...validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) => Object.values(error.constraints ?? {})));
      if (!dto.name?.trim()) row.errors.push('name wajib diisi');
      if (dto.nik && (seenNik.has(dto.nik) || existingNik.has(dto.nik))) row.errors.push('NIK duplikat');
      if (dto.employeeNumber && (seenEmployeeNumber.has(dto.employeeNumber) || existingEmployeeNumber.has(dto.employeeNumber))) row.errors.push('NIP duplikat');
      if (initialLocationReference && !initialLocationId) row.errors.push('initialLocationReference tidak ditemukan');
      if (dto.attendanceRequired === false && !dto.attendanceExemptionReason?.trim()) row.errors.push('attendanceExemptionReason wajib jika attendanceRequired=false');
      if (dto.nik) seenNik.add(dto.nik);
      if (dto.employeeNumber) seenEmployeeNumber.add(dto.employeeNumber);

      const email = controls.loginEmail?.toLowerCase();
      if (controls.provisionUser) {
        if (!email || !isEmail(email)) row.errors.push('loginEmail valid wajib jika provisionUser=true');
        if (!controls.userRole || !Object.values(Role).includes(controls.userRole as Role)) row.errors.push('userRole harus menggunakan Role yang valid');
        if (email && (seenEmail.has(email) || existingEmails.has(email))) row.errors.push('loginEmail duplikat');
      } else if (controls.loginEmail || controls.userRole) {
        row.errors.push('loginEmail dan userRole hanya boleh diisi jika provisionUser=true');
      }
      if (email) seenEmail.add(email);
      row.data = { ...dto, ...controls, loginEmail: email } as EmployeeXlsxRow;
    }
    const invalidCount = rows.filter((row) => row.errors.length > 0).length;
    return { valid: invalidCount === 0, totalRows: rows.length, validCount: rows.length - invalidCount, invalidCount, rows, errors: rows.filter((row) => row.errors.length).map(({ row, errors }) => ({ row, errors })) };
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
    this.assertMayConfigureAttendanceMode(dto.attendanceMode, actor);
    const before = await tx.employee.findUnique({ where: { id }, include: SUMMARY_INCLUDE });
    if (!before) throw new NotFoundException('Karyawan tidak ditemukan');
    const changedSensitive = Object.keys(dto).some((key) => key !== 'reason' && SENSITIVE_FIELDS.has(key) && (dto as any)[key] !== (before as any)[key]);
    if (changedSensitive && !dto.reason?.trim()) throw new BadRequestException('Alasan wajib diisi untuk perubahan data karyawan sensitif');
    this.validateAttendanceEligibility(dto.attendanceRequired, dto.attendanceExemptionReason, before);
    await this.assertIdentityUnique(dto.nik, dto.employeeNumber, id, tx);
    const { trainingEndDate, dateOfBirth, reason, ...rest } = dto;
    const changedFields = Object.keys(rest).filter((key) => (rest as any)[key] !== undefined && (rest as any)[key] !== (before as any)[key]);
    if (trainingEndDate !== undefined && new Date(trainingEndDate).getTime() !== new Date(before.trainingEndDate ?? 0).getTime()) changedFields.push('trainingEndDate');
    if (dateOfBirth !== undefined && new Date(dateOfBirth).getTime() !== new Date(before.dateOfBirth ?? 0).getTime()) changedFields.push('dateOfBirth');
    const updated = await tx.employee.update({ where: { id }, data: { ...rest, trainingEndDate: trainingEndDate ? new Date(trainingEndDate) : undefined, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined }, include: SUMMARY_INCLUDE });
    if (dto.status === 'RESIGNED') await tx.user.updateMany({ where: { employeeId: id, isActive: true }, data: { isActive: false } });
    await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: changedSensitive ? 'EMPLOYEE_SENSITIVE_UPDATE' : 'EMPLOYEE_UPDATE', entity: 'Employee', entityId: id, oldValue: { fields: changedFields, profile: this.auditProjection(before) } as any, newValue: { fields: changedFields, profile: this.auditProjection(updated) } as any, reason: reason ?? null, source: 'EMPLOYEE_MANAGEMENT', relatedEntityId: updated.user?.id } });
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

  async forceDelete(id: string, reason: string, confirmation: string, actor: AuthenticatedUser) {
    if (confirmation !== 'HAPUS') throw new BadRequestException('Konfirmasi Force Delete harus persis HAPUS');
    if (reason.trim().length < 3) throw new BadRequestException('Alasan Force Delete wajib diisi');
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: {
        id: true, name: true, employeeNumber: true, deletedAt: true,
        user: { select: { id: true } },
        _count: { select: { attendances: true, leaveRequests: true, placements: true, contracts: true, payrollSlips: true, profileChangeRequests: true, leaveBalances: true, temporaryAssignments: true, absenceCases: true, overtimeRequests: true } },
      },
    });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
    if (employee.deletedAt) throw new ConflictException('Karyawan sudah dihapus paksa sebelumnya');
    const now = new Date();
    const tombstoneName = `Karyawan Dihapus ${id.slice(0, 8).toUpperCase()}`;
    await this.prisma.$transaction(async (tx) => {
      if (employee.user) {
        await tx.userTemporaryCredential.deleteMany({ where: { userId: employee.user.id } });
        await tx.user.update({ where: { id: employee.user.id }, data: { isActive: false, employeeId: null, sessionVersion: { increment: 1 } } });
      }
      await Promise.all([
        tx.placement.updateMany({ where: { employeeId: id, status: { in: ['ACTIVE', 'SCHEDULED'] } }, data: { status: 'ENDED', endDate: now } }),
        tx.contract.updateMany({ where: { employeeId: id, status: 'ACTIVE' }, data: { status: 'TERMINATED', endDate: now } }),
        tx.placementRequest.updateMany({ where: { employeeId: id, status: { in: ['PENDING_HR', 'PENDING_DIRECTOR'] } }, data: { status: 'CANCELLED' } }),
        tx.leaveRequest.updateMany({ where: { employeeId: id, status: { in: ['PENDING', 'PENDING_COORDINATOR', 'PENDING_HR', 'PENDING_DIRECTOR'] } }, data: { status: 'CANCELLED', reviewedById: actor.userId, reviewedAt: now, reviewNote: 'Dibatalkan oleh Force Delete Employee' } }),
        tx.overtimeRequest.updateMany({ where: { employeeId: id, status: 'PENDING' }, data: { status: 'CANCELLED', reviewedById: actor.userId, reviewedAt: now, reviewNote: 'Dibatalkan oleh Force Delete Employee' } }),
        tx.temporaryAssignment.updateMany({ where: { employeeId: id, status: { in: ['PENDING', 'APPROVED'] } }, data: { status: 'CANCELLED' } }),
        tx.employeeProfileChangeRequest.updateMany({ where: { employeeId: id, status: 'PENDING' }, data: { status: 'CANCELLED', reviewedById: actor.userId, reviewedAt: now, reviewNote: 'Dibatalkan oleh Force Delete Employee' } }),
      ]);
      await tx.employee.update({ where: { id }, data: {
        name: tombstoneName, nik: null, employeeNumber: null, phone: null, address: null, email: null,
        dateOfBirth: null, gender: null, bankAccountNumber: null, bpjsKesehatanNumber: null,
        bpjsKetenagakerjaanNumber: null, jobTitle: null, photoUrl: null, coordinatorId: null, dailyRate: null,
        status: 'TERMINATED', attendanceRequired: false, attendanceExemptionReason: 'Employee telah dihapus paksa',
        deletedAt: now, deletedById: actor.userId, deletionReason: reason.trim(),
      } });
      await tx.auditLog.create({ data: {
        actorId: actor.userId, actorRole: actor.role as Role, action: 'EMPLOYEE_FORCE_DELETE', entity: 'Employee', entityId: id,
        oldValue: { name: employee.name, employeeNumber: employee.employeeNumber, dependencies: employee._count } as any,
        newValue: { strategy: 'ANONYMIZED_TOMBSTONE', tombstoneName, linkedUserDisabled: !!employee.user } as any,
        reason: reason.trim(), source: 'EMPLOYEE_MANAGEMENT', relatedEntityId: id,
      } });
    });
    return { deleted: true, strategy: 'ANONYMIZED_TOMBSTONE', employeeId: id };
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

  private assertMayConfigureAttendanceMode(mode: string | undefined, actor: AuthenticatedUser) {
    if (mode !== undefined && actor.role !== Role.ADMIN_HR) {
      throw new ForbiddenException('Hanya Admin HR yang dapat mengatur mode absensi karyawan');
    }
  }

  private async assertEmployeeScope(employee: { employmentType: string; user?: { id: string } | null }, actor: AuthenticatedUser) {
    if (employee.user?.id === actor.userId) return;
    if (actor.role === Role.KOORDINATOR) await this.scopes.assertEmployee(actor.userId, employee);
    if (actor.role === Role.KARYAWAN && employee.user?.id !== actor.userId) throw new ForbiddenException('Anda hanya dapat mengakses profil sendiri');
  }

  private present(employee: any, actor: AuthenticatedUser) {
    if ([Role.ADMIN_HR, Role.SYSTEM_ADMIN].includes(actor.role as Role)) return employee;
    if (actor.role === Role.KARYAWAN) {
      const { dailyRate, contracts, ...selfService } = employee;
      return selfService;
    }
    const { id, name, employmentType, status, joinDate, jobTitle, photoUrl, attendanceRequired, attendanceExemptionReason, attendanceMode, coordinatorId, createdAt, updatedAt, placements } = employee;
    return { id, name, employmentType, status, joinDate, jobTitle, photoUrl, attendanceRequired, attendanceExemptionReason, attendanceMode, coordinatorId, createdAt, updatedAt, placements };
  }

  private auditProjection(employee: any) {
    const { nik, employeeNumber, bankAccountNumber, bpjsKesehatanNumber, bpjsKetenagakerjaanNumber, dailyRate, contracts, address, phone, email, dateOfBirth, photoUrl, ...safe } = employee;
    return safe;
  }
}
