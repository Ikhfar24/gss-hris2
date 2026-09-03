import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
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

  async create(dto: CreateHolidayDto, actorId: string) {
    const holiday = await this.prisma.holiday.create({
      data: {
        date: new Date(dto.date),
        name: dto.name,
        type: dto.type,
        locationId: dto.locationId,
      },
    });

    await this.auditLog.record({
      actorId,
      action: 'HOLIDAY_CREATE',
      entity: 'Holiday',
      entityId: holiday.id,
      newValue: holiday,
    });

    return holiday;
  }

  async remove(id: string, actorId: string) {
    const holiday = await this.prisma.holiday.delete({ where: { id } });
    await this.auditLog.record({
      actorId,
      action: 'HOLIDAY_DELETE',
      entity: 'Holiday',
      entityId: id,
      oldValue: holiday,
    });
    return holiday;
  }
}
