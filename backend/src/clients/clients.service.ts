import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { buildImportTemplate, parseImportXlsx, ParsedXlsxRow, XlsxImportColumn, XlsxUpload } from '../common/utils/xlsx-import.util';
import { normalizeReferenceCode } from '../common/utils/reference-code.util';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

const CLIENT_IMPORT_COLUMNS: XlsxImportColumn[] = [
  { key: 'referenceCode', type: 'string', required: true, description: 'Kode referensi Client yang mudah dibaca dan unik, digunakan untuk menghubungkan import Lokasi. Huruf akan dinormalisasi menjadi kapital.', example: 'CL-SINAR-ABADI' },
  { key: 'name', type: 'string', required: true, description: 'Nama resmi Client', example: 'PT Sinar Abadi' },
  { key: 'address', type: 'string', description: 'Alamat Client', example: 'Jl. Gatot Subroto No. 15, Jakarta' },
  { key: 'contactPerson', type: 'string', description: 'Nama narahubung Client', example: 'Siti Rahmawati' },
  { key: 'contactPhone', type: 'string', description: 'Nomor telepon / WhatsApp narahubung', example: '081298765432' },
  { key: 'isActive', type: 'boolean', description: 'TRUE untuk Client aktif dan FALSE untuk Client nonaktif. Jika kosong, default TRUE.', example: true, allowedValues: [true, false] },
];
const LEGACY_CLIENT_IMPORT_COLUMNS = CLIENT_IMPORT_COLUMNS.slice(1);

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  findAll() {
    return this.prisma.client.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      select: {
        id: true, referenceCode: true, name: true, address: true, contactPerson: true, contactPhone: true, isActive: true, deletedAt: true,
        locations: { select: { id: true, referenceCode: true, name: true, address: true, isActive: true }, orderBy: { name: 'asc' } },
      },
    });
    if (!client || client.deletedAt) throw new NotFoundException('Client tidak ditemukan');
    return client;
  }

  async create(dto: CreateClientDto, actor: AuthenticatedUser) {
    this.assertAdminHr(actor);
    const referenceCode = dto.referenceCode ? normalizeReferenceCode(dto.referenceCode) : generatedReferenceCode('CL', dto.name);
    const name = dto.name.trim();
    await this.assertActiveIdentityAvailable(name, referenceCode);
    let client;
    try {
      client = await this.prisma.client.create({ data: { ...dto, name, referenceCode } });
    } catch (error) {
      throwIdentityConflict(error, 'Client');
    }
    await this.auditLog.record({
      actorId: actor.userId,
      action: 'CLIENT_CREATE',
      entity: 'Client',
      entityId: client.id,
      newValue: client,
    });
    return client;
  }

  async update(id: string, dto: UpdateClientDto, actor: AuthenticatedUser) {
    this.assertAdminHr(actor);
    const before = await this.prisma.client.findUnique({ where: { id } });
    if (!before || before.deletedAt) throw new NotFoundException('Client tidak ditemukan');
    const name = dto.name === undefined ? before.name : dto.name.trim();
    const referenceCode = dto.referenceCode === undefined ? before.referenceCode : normalizeReferenceCode(dto.referenceCode);
    await this.assertActiveIdentityAvailable(name, referenceCode, id);
    let updated;
    try {
      updated = await this.prisma.client.update({ where: { id }, data: { ...dto, name, referenceCode } });
    } catch (error) {
      throwIdentityConflict(error, 'Client');
    }
    await this.auditLog.record({
      actorId: actor.userId,
      action: 'CLIENT_UPDATE',
      entity: 'Client',
      entityId: id,
      oldValue: before,
      newValue: updated,
    });
    return updated;
  }

  importTemplate() {
    return buildImportTemplate('Clients', CLIENT_IMPORT_COLUMNS);
  }

  async previewImport(file: XlsxUpload) {
    const rows = await parseImportXlsx<CreateClientDto & Record<string, unknown>>(file, CLIENT_IMPORT_COLUMNS, [LEGACY_CLIENT_IMPORT_COLUMNS]);
    return this.validateImportRows(rows);
  }

  async commitImport(file: XlsxUpload, actor: AuthenticatedUser) {
    this.assertAdminHr(actor);
    const preview = await this.previewImport(file);
    if (!preview.valid) throw new BadRequestException({ message: 'Import client gagal divalidasi', ...preview });
    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const records: { id: string; referenceCode: string; name: string }[] = [];
        for (const row of preview.rows) records.push(await tx.client.create({ data: row.data as CreateClientDto, select: { id: true, referenceCode: true, name: true } }));
        await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: 'CLIENT_IMPORT', entity: 'Client', newValue: { rowCount: records.length }, source: 'CLIENT_IMPORT' } });
        return records;
      });
    } catch (error) {
      throwIdentityConflict(error, 'Client');
    }
    return { valid: true, created: created.length, records: created, errors: [] };
  }

  async remove(id: string, reason: string, actor: AuthenticatedUser) {
    this.assertAdminHr(actor);
    this.assertReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { locations: true, payrollCycleSettings: true, temporaryAssignments: true } } },
      });
      if (!client) throw new NotFoundException('Client tidak ditemukan');
      if (Object.values(client._count).some((count) => count > 0)) {
        throw new ConflictException('Client masih memiliki relasi operasional atau riwayat. Gunakan Force Delete.');
      }
      const { _count, ...snapshot } = client;
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: Role.ADMIN_HR, action: 'CLIENT_DELETE_SAFE', entity: 'Client', entityId: id, oldValue: snapshot as any, reason: reason.trim(), source: 'CLIENT_MANAGEMENT' } });
      await tx.client.delete({ where: { id } });
      return { deleted: true, strategy: 'PHYSICAL_PRISTINE_DELETE' };
    });
  }

  async forceDelete(id: string, reason: string, actor: AuthenticatedUser) {
    this.assertAdminHr(actor);
    this.assertReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { locations: true, payrollCycleSettings: true, temporaryAssignments: true } } },
      });
      if (!client) throw new NotFoundException('Client tidak ditemukan');
      await tx.payrollCycleSetting.updateMany({ where: { clientId: id, isActive: true }, data: { isActive: false } });
      const deletedAt = new Date();
      await tx.client.update({ where: { id }, data: { isActive: false, deletedAt, deletedById: actor.userId, deletionReason: reason.trim() } });
      const { _count, ...snapshot } = client;
      await tx.auditLog.create({ data: { actorId: actor.userId, actorRole: Role.ADMIN_HR, action: 'CLIENT_FORCE_DELETE', entity: 'Client', entityId: id, oldValue: snapshot as any, newValue: { strategy: 'TOMBSTONE', deletedAt, dependencies: _count }, reason: reason.trim(), source: 'CLIENT_MANAGEMENT' } });
      return { deleted: true, strategy: 'TOMBSTONE' };
    });
  }

  private async validateImportRows(rows: ParsedXlsxRow<CreateClientDto & Record<string, unknown>>[]) {
    for (const row of rows) {
      if (!row.data.referenceCode && typeof row.data.name === 'string') row.data.referenceCode = generatedReferenceCode('CL', row.data.name);
      if (typeof row.data.referenceCode === 'string') row.data.referenceCode = normalizeReferenceCode(row.data.referenceCode);
    }
    const names = rows.map(({ data }) => data.name).filter((name): name is string => typeof name === 'string' && !!name.trim());
    const referenceCodes = rows.map(({ data }) => data.referenceCode).filter((code): code is string => typeof code === 'string' && !!code);
    const existing = names.length || referenceCodes.length ? await this.prisma.client.findMany({ where: { deletedAt: null, OR: [
      ...(names.length ? [{ name: { in: names, mode: 'insensitive' as const } }] : []),
      ...(referenceCodes.length ? [{ referenceCode: { in: referenceCodes } }] : []),
    ] }, select: { name: true, referenceCode: true } }) : [];
    const existingNames = new Set(existing.map((client) => client.name.trim().toLowerCase()));
    const existingCodes = new Set(existing.map((client) => client.referenceCode).filter((code): code is string => typeof code === 'string').map(normalizeReferenceCode));
    const seenNames = new Set<string>();
    const seenCodes = new Set<string>();
    for (const row of rows) {
      const dto = plainToInstance(CreateClientDto, row.data);
      row.errors.push(...validationMessages(dto));
      const name = dto.name?.trim().toLowerCase();
      if (!name) row.errors.push('name wajib diisi');
      else if (seenNames.has(name) || existingNames.has(name)) row.errors.push('name client duplikat');
      if (name) seenNames.add(name);
      const referenceCode = dto.referenceCode && normalizeReferenceCode(dto.referenceCode);
      if (referenceCode && (seenCodes.has(referenceCode) || existingCodes.has(referenceCode))) row.errors.push('referenceCode client sudah digunakan');
      if (referenceCode) seenCodes.add(referenceCode);
      if (dto.name) dto.name = dto.name.trim();
      row.data = dto as CreateClientDto & Record<string, unknown>;
    }
    const invalidCount = rows.filter((row) => row.errors.length > 0).length;
    return { valid: invalidCount === 0, totalRows: rows.length, validCount: rows.length - invalidCount, invalidCount, rows, errors: rows.filter((row) => row.errors.length).map(({ row, errors }) => ({ row, errors })) };
  }

  private assertAdminHr(actor: AuthenticatedUser) {
    if (actor.role !== Role.ADMIN_HR) throw new ForbiddenException('Hanya Admin HR yang dapat mengelola Client');
  }

  private assertReason(reason: string) {
    if (!reason.trim()) throw new BadRequestException('Alasan wajib diisi');
  }

  private async assertActiveIdentityAvailable(name: string, referenceCode: string, excludeId?: string) {
    const existing = await this.prisma.client.findFirst({
      where: {
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [{ referenceCode }, { name: { equals: name, mode: 'insensitive' } }],
      },
      select: { name: true, referenceCode: true },
    });
    if (!existing) return;
    if (normalizeReferenceCode(existing.referenceCode) === referenceCode) throw new ConflictException('referenceCode client sudah digunakan');
    throw new ConflictException('name client duplikat');
  }
}

function throwIdentityConflict(error: unknown, entity: 'Client'): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException(`Nama atau referenceCode ${entity} sudah digunakan oleh data aktif`);
  }
  throw error;
}

function validationMessages(value: object): string[] {
  return validateSync(value, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) => Object.values(error.constraints ?? {}));
}

function generatedReferenceCode(prefix: string, name: string): string {
  const slug = name.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 32);
  return `${prefix}-${slug || 'IMPORT'}`;
}
