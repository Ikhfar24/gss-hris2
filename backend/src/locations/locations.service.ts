import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { buildImportTemplate, parseImportXlsx, ParsedXlsxRow, XlsxImportColumn, XlsxUpload } from '../common/utils/xlsx-import.util';
import { normalizeReferenceCode } from '../common/utils/reference-code.util';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

const LOCATION_IMPORT_COLUMNS: XlsxImportColumn[] = [
  { key: 'referenceCode', type: 'string', required: true, description: 'Kode referensi Lokasi yang mudah dibaca dan unik, digunakan untuk menghubungkan import Karyawan. Huruf akan dinormalisasi menjadi kapital.', example: 'LOC-PURWOKERTO' },
  { key: 'name', type: 'string', required: true, description: 'Nama lokasi kerja atau nama cabang.', example: 'Kantor Cabang Purwokerto' },
  { key: 'clientReference', aliases: ['clientId'], type: 'string', description: 'referenceCode Client yang menaungi lokasi ini. Workbook lama boleh memakai header clientId dan nilai ID internal lama.', example: 'CL-SINAR-ABADI' },
  { key: 'address', type: 'string', description: 'Alamat lengkap lokasi kerja', example: 'Jl. Jenderal Sudirman No. 20, Purwokerto' },
  { key: 'latitude', type: 'number', description: 'Lintang dalam angka desimal, rentang -90 sampai 90. Gunakan tanda minus untuk lintang selatan; bukan URL Google Maps.', example: -7.4246 },
  { key: 'longitude', type: 'number', description: 'Bujur dalam angka desimal, rentang -180 sampai 180. Gunakan angka koordinat, bukan URL Google Maps.', example: 109.2302 },
  { key: 'radiusMeters', type: 'integer', description: 'Radius geofence dalam meter, minimal 50. Jika kosong, default 300 meter.', example: 150 },
  { key: 'checkInTime', type: 'string', description: 'Jam mulai kerja dalam format 24 jam HH:mm. Jika kosong, default 08:00.', example: '08:00' },
  { key: 'checkOutTime', type: 'string', description: 'Jam selesai kerja dalam format 24 jam HH:mm. Jika kosong, default 16:00.', example: '16:00' },
  { key: 'toleranceMin', type: 'integer', description: 'Toleransi keterlambatan dalam menit, minimal 0. Jika kosong, default 10 menit.', example: 10 },
  { key: 'workDays', type: 'integerArray', description: 'Hari kerja berupa angka dipisahkan koma: 0=Minggu, 1=Senin, 2=Selasa, 3=Rabu, 4=Kamis, 5=Jumat, 6=Sabtu.', example: '1,2,3,4,5' },
  { key: 'isActive', type: 'boolean', description: 'TRUE untuk lokasi aktif dan FALSE untuk lokasi nonaktif. Lokasi aktif wajib memiliki latitude dan longitude. Jika kosong, default TRUE.', example: true, allowedValues: [true, false] },
];
const LEGACY_LOCATION_IMPORT_COLUMNS: XlsxImportColumn[] = [
  LOCATION_IMPORT_COLUMNS[1],
  LOCATION_IMPORT_COLUMNS[2],
  ...LOCATION_IMPORT_COLUMNS.slice(3),
];

type LocationXlsxRow = Omit<CreateLocationDto, 'clientId'> & { clientReference?: string } & Record<string, unknown>;

@Injectable()
export class LocationsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  findAll() {
    return this.prisma.location.findMany({
      where: { deletedAt: null },
      include: { client: { select: { id: true, referenceCode: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const loc = await this.prisma.location.findUnique({
      where: { id },
      include: { client: { select: { id: true, referenceCode: true, name: true } } },
    });
    if (!loc || loc.deletedAt) throw new NotFoundException('Lokasi tidak ditemukan');
    return loc;
  }

  async create(dto: CreateLocationDto, actor: AuthenticatedUser) {
    this.assertAdminHr(actor);
    this.assertUsableConfiguration({ ...dto, isActive: true, radiusMeters: dto.radiusMeters ?? 300 });
    await this.assertClientAvailable(dto.clientId);
    const referenceCode = dto.referenceCode ? normalizeReferenceCode(dto.referenceCode) : generatedReferenceCode('LOC', dto.name);
    const loc = await this.prisma.location.create({ data: { ...dto, referenceCode } });
    await this.auditLog.record({
      actorId: actor.userId,
      action: 'LOCATION_CREATE',
      entity: 'Location',
      entityId: loc.id,
      newValue: loc,
    });
    return loc;
  }

  // This is *the* configurable-not-hard-coded surface from PRD section 5/12:
  // radius, jam kerja, toleransi, hari kerja all change here, not in code.
  async update(id: string, dto: UpdateLocationDto, actor: AuthenticatedUser) {
    this.assertAdminHr(actor);
    const before = await this.findOne(id);
    this.assertUsableConfiguration({ ...before, ...dto });
    await this.assertClientAvailable(dto.clientId ?? undefined);
    const updated = await this.prisma.location.update({ where: { id }, data: { ...dto, referenceCode: dto.referenceCode === undefined ? undefined : normalizeReferenceCode(dto.referenceCode) } });
    await this.auditLog.record({
      actorId: actor.userId,
      action: 'LOCATION_UPDATE',
      entity: 'Location',
      entityId: id,
      oldValue: before,
      newValue: updated,
      reason: 'Perubahan konfigurasi operasional lokasi',
    });
    return updated;
  }

  importTemplate() {
    return buildImportTemplate('Locations', LOCATION_IMPORT_COLUMNS);
  }

  async previewImport(file: XlsxUpload) {
    const rows = await parseImportXlsx<LocationXlsxRow>(file, LOCATION_IMPORT_COLUMNS, [LEGACY_LOCATION_IMPORT_COLUMNS]);
    return this.validateImportRows(rows);
  }

  async commitImport(file: XlsxUpload, actor: AuthenticatedUser) {
    this.assertAdminHr(actor);
    const preview = await this.previewImport(file);
    if (!preview.valid) throw new BadRequestException({ message: 'Import lokasi gagal divalidasi', ...preview });
    const records = await this.prisma.$transaction(async (tx) => {
      const result: { id: string; referenceCode: string; name: string; clientId: string | null }[] = [];
      for (const row of preview.rows) result.push(await tx.location.create({ data: row.data as CreateLocationDto, select: { id: true, referenceCode: true, name: true, clientId: true } }));
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'LOCATION_IMPORT', entity: 'Location', newValue: { rowCount: result.length }, source: 'LOCATION_IMPORT' } });
      return result;
    });
    return { valid: true, created: records.length, records, errors: [] };
  }

  async remove(id: string, reason: string, actor: AuthenticatedUser) {
    this.assertAdminHr(actor);
    this.assertReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { placements: true, placementRequestsFrom: true, placementRequestsTo: true, attendances: true, holidays: true, payrollCycleSettings: true, temporaryAssignments: true } } },
      });
      if (!location) throw new NotFoundException('Lokasi tidak ditemukan');
      if (Object.values(location._count).some((count) => count > 0)) {
        throw new ConflictException('Lokasi masih memiliki relasi operasional atau riwayat. Gunakan Force Delete.');
      }
      const { _count, ...snapshot } = location;
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: Role.ADMIN_HR, action: 'LOCATION_DELETE_SAFE', entity: 'Location', entityId: id, oldValue: snapshot as any, reason: reason.trim(), source: 'LOCATION_MANAGEMENT', relatedEntityId: location.clientId } });
      await tx.location.delete({ where: { id } });
      return { deleted: true, strategy: 'PHYSICAL_PRISTINE_DELETE' };
    });
  }

  async forceDelete(id: string, reason: string, actor: AuthenticatedUser) {
    this.assertAdminHr(actor);
    this.assertReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { placements: true, placementRequestsFrom: true, placementRequestsTo: true, attendances: true, holidays: true, payrollCycleSettings: true, temporaryAssignments: true } } },
      });
      if (!location) throw new NotFoundException('Lokasi tidak ditemukan');

      const deletedAt = new Date();
      await tx.placement.updateMany({ where: { locationId: id, status: 'ACTIVE' }, data: { status: 'ENDED', endDate: deletedAt } });
      await tx.placement.updateMany({ where: { locationId: id, status: 'SCHEDULED' }, data: { status: 'ENDED' } });
      await tx.placementRequest.updateMany({ where: { OR: [{ originLocationId: id }, { destinationLocationId: id }], status: { in: ['PENDING_HR', 'PENDING_DIRECTOR'] } }, data: { status: 'CANCELLED' } });
      await tx.temporaryAssignment.updateMany({ where: { locationId: id, status: { in: ['PENDING', 'APPROVED'] } }, data: { status: 'CANCELLED' } });
      await tx.payrollCycleSetting.updateMany({ where: { locationId: id, isActive: true }, data: { isActive: false } });
      await tx.location.update({ where: { id }, data: { isActive: false, deletedAt, deletedById: actor.userId, deletionReason: reason.trim() } });
      const { _count, ...snapshot } = location;
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: Role.ADMIN_HR, action: 'LOCATION_FORCE_DELETE', entity: 'Location', entityId: id, oldValue: snapshot as any, newValue: { strategy: 'TOMBSTONE', deletedAt, dependencies: _count }, reason: reason.trim(), source: 'LOCATION_MANAGEMENT', relatedEntityId: location.clientId } });
      return { deleted: true, strategy: 'TOMBSTONE' };
    });
  }

  private async validateImportRows(rows: ParsedXlsxRow<LocationXlsxRow>[]) {
    const clientReferences = [...new Set(rows.map(({ data }) => data.clientReference).filter((value): value is string => typeof value === 'string' && !!value))];
    const normalizedClientReferences = clientReferences.map(normalizeReferenceCode);
    const clients = clientReferences.length ? await this.prisma.client.findMany({ where: { deletedAt: null, OR: [{ referenceCode: { in: normalizedClientReferences } }, { id: { in: clientReferences } }] }, select: { id: true, referenceCode: true } }) : [];
    const clientsByCode = new Map<string, string>(clients.flatMap((client) => typeof client.referenceCode === 'string' ? [[normalizeReferenceCode(client.referenceCode), client.id] as [string, string]] : []));
    const clientIds = new Set(clients.map((client) => client.id));
    for (const row of rows) {
      const { clientReference, ...data } = row.data;
      const resolvedClientId = clientReference ? clientsByCode.get(normalizeReferenceCode(clientReference)) ?? (clientIds.has(clientReference) ? clientReference : undefined) : undefined;
      const referenceCode = typeof data.referenceCode === 'string' ? normalizeReferenceCode(data.referenceCode) : generatedReferenceCode('LOC', String(data.name ?? ''));
      row.data = { ...data, referenceCode, clientId: resolvedClientId } as LocationXlsxRow;
      if (clientReference && !resolvedClientId) row.errors.push('clientReference tidak ditemukan');
    }
    const names = rows.map(({ data }) => data.name).filter((name): name is string => typeof name === 'string' && !!name.trim());
    const referenceCodes = rows.map(({ data }) => data.referenceCode).filter((value): value is string => typeof value === 'string' && !!value);
    const locations = names.length || referenceCodes.length ? await this.prisma.location.findMany({ where: { OR: [
      ...(names.length ? [{ name: { in: names, mode: 'insensitive' as const } }] : []),
      ...(referenceCodes.length ? [{ referenceCode: { in: referenceCodes } }] : []),
    ] }, select: { name: true, clientId: true, referenceCode: true } }) : [];
    const existingKeys = new Set(locations.map((location) => locationKey(location.name, location.clientId)));
    const existingCodes = new Set(locations.map((location) => location.referenceCode).filter((code): code is string => typeof code === 'string').map(normalizeReferenceCode));
    const seen = new Set<string>();
    const seenCodes = new Set<string>();
    for (const row of rows) {
      const dto = plainToInstance(CreateLocationDto, row.data);
      row.errors.push(...validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) => Object.values(error.constraints ?? {})));
      if (!dto.name?.trim()) row.errors.push('name wajib diisi');
      const key = locationKey(dto.name ?? '', dto.clientId ?? null);
      if (dto.name && (seen.has(key) || existingKeys.has(key))) row.errors.push('lokasi duplikat untuk client yang sama');
      seen.add(key);
      const referenceCode = dto.referenceCode && normalizeReferenceCode(dto.referenceCode);
      if (referenceCode && (seenCodes.has(referenceCode) || existingCodes.has(referenceCode))) row.errors.push('referenceCode lokasi sudah digunakan');
      if (referenceCode) seenCodes.add(referenceCode);
      const hasLatitude = dto.latitude !== undefined;
      const hasLongitude = dto.longitude !== undefined;
      if (hasLatitude !== hasLongitude) row.errors.push('latitude dan longitude harus diisi bersama');
      if ((dto.isActive ?? true) && (!hasLatitude || !hasLongitude)) row.errors.push('lokasi aktif memerlukan koordinat geofence lengkap');
      if (dto.checkInTime && !validTime(dto.checkInTime)) row.errors.push('checkInTime harus berformat HH:mm');
      if (dto.checkOutTime && !validTime(dto.checkOutTime)) row.errors.push('checkOutTime harus berformat HH:mm');
      if (dto.workDays && (dto.workDays.length === 0 || new Set(dto.workDays).size !== dto.workDays.length)) row.errors.push('workDays tidak boleh kosong atau duplikat');
      row.data = dto as CreateLocationDto & Record<string, unknown>;
    }
    const invalidCount = rows.filter((row) => row.errors.length > 0).length;
    return { valid: invalidCount === 0, totalRows: rows.length, validCount: rows.length - invalidCount, invalidCount, rows, errors: rows.filter((row) => row.errors.length).map(({ row, errors }) => ({ row, errors })) };
  }

  private assertUsableConfiguration(config: { latitude?: number | null; longitude?: number | null; radiusMeters: number; isActive: boolean }) {
    const hasLatitude = config.latitude !== null && config.latitude !== undefined;
    const hasLongitude = config.longitude !== null && config.longitude !== undefined;
    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException('Latitude dan longitude lokasi harus diisi bersama');
    }
    if (hasLatitude && (!Number.isFinite(config.latitude) || config.latitude! < -90 || config.latitude! > 90)) {
      throw new BadRequestException('Latitude lokasi harus berupa angka antara -90 dan 90');
    }
    if (hasLongitude && (!Number.isFinite(config.longitude) || config.longitude! < -180 || config.longitude! > 180)) {
      throw new BadRequestException('Longitude lokasi harus berupa angka antara -180 dan 180');
    }
    if (!Number.isInteger(config.radiusMeters) || config.radiusMeters < 50) {
      throw new BadRequestException('Radius lokasi harus berupa bilangan bulat minimal 50 meter');
    }
    if (config.isActive && (!hasLatitude || !hasLongitude)) {
      throw new BadRequestException('Lokasi aktif memerlukan koordinat geofence yang lengkap');
    }
  }

  private assertAdminHr(actor: AuthenticatedUser) {
    if (actor.role !== Role.ADMIN_HR) throw new ForbiddenException('Hanya Admin HR yang dapat mengelola Lokasi');
  }

  private assertReason(reason: string) {
    if (!reason.trim()) throw new BadRequestException('Alasan wajib diisi');
  }

  private async assertClientAvailable(clientId?: string) {
    if (!clientId) return;
    const client = await this.prisma.client.findFirst({ where: { id: clientId, deletedAt: null, isActive: true }, select: { id: true } });
    if (!client) throw new BadRequestException('Client aktif tidak ditemukan');
  }
}

function validTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function locationKey(name: string, clientId: string | null) {
  return `${clientId ?? ''}\u0000${name.trim().toLowerCase()}`;
}

function generatedReferenceCode(prefix: string, name: string): string {
  const slug = name.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 32);
  return `${prefix}-${slug || 'IMPORT'}`;
}
