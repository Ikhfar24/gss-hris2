import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateHolidayDto } from './dto/create-holiday.dto';

@Injectable()
export class HolidaysService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  findAll() {
    return this.prisma.holiday.findMany({ orderBy: { date: 'asc' }, include: { location: { select: { id: true, name: true } } } });
  }

  async create(dto: CreateHolidayDto, actorOrId: AuthenticatedUser | string) {
    const actorId = typeof actorOrId === 'string' ? actorOrId : actorOrId.userId;
    const actor = typeof actorOrId === 'string' ? null : actorOrId;
    const type = dto.type ?? 'NATIONAL';
    if (type === 'LOCATION_SPECIFIC' && !dto.locationId) {
      throw new BadRequestException('Hari libur khusus lokasi wajib memilih lokasi');
    }
    if (type !== 'LOCATION_SPECIFIC' && dto.locationId) {
      throw new BadRequestException('Lokasi hanya boleh diisi untuk hari libur khusus lokasi');
    }
    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({ where: { id: dto.locationId, deletedAt: null, isActive: true }, select: { id: true } });
      if (!location) throw new BadRequestException('Lokasi aktif tidak ditemukan');
    }
    const holiday = await this.prisma.holiday.create({
      data: {
        date: new Date(dto.date),
        name: dto.name,
        type,
        locationId: dto.locationId ?? null,
      },
    });

    await this.auditLog.record({
      actorId,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      actorRole: actor?.role,
      action: 'HOLIDAY_CREATE',
      entity: 'Holiday',
      entityId: holiday.id,
      newValue: holiday,
    });

    return holiday;
  }

  async remove(id: string, actorOrId: AuthenticatedUser | string) {
    const actorId = typeof actorOrId === 'string' ? actorOrId : actorOrId.userId;
    const actor = typeof actorOrId === 'string' ? null : actorOrId;
    const holiday = await this.prisma.holiday.delete({ where: { id } });
    await this.auditLog.record({
      actorId,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      actorRole: actor?.role,
      action: 'HOLIDAY_DELETE',
      entity: 'Holiday',
      entityId: id,
      oldValue: holiday,
    });
    return holiday;
  }
}
