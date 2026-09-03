import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  findAll() {
    return this.prisma.location.findMany({
      include: { client: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const loc = await this.prisma.location.findUnique({
      where: { id },
      include: { client: { select: { id: true, name: true } } },
    });
    if (!loc) throw new NotFoundException('Lokasi tidak ditemukan');
    return loc;
  }

  async create(dto: CreateLocationDto, actorId: string) {
    const loc = await this.prisma.location.create({ data: dto });
    await this.auditLog.record({
      actorId,
      action: 'LOCATION_CREATE',
      entity: 'Location',
      entityId: loc.id,
      newValue: loc,
    });
    return loc;
  }

  // This is *the* configurable-not-hard-coded surface from PRD section 5/12:
  // radius, jam kerja, toleransi, hari kerja all change here, not in code.
  async update(id: string, dto: UpdateLocationDto, actorId: string) {
    const before = await this.findOne(id);
    const updated = await this.prisma.location.update({ where: { id }, data: dto });
    await this.auditLog.record({
      actorId,
      action: 'LOCATION_UPDATE',
      entity: 'Location',
      entityId: id,
      oldValue: before,
      newValue: updated,
      reason: 'Perubahan konfigurasi operasional lokasi',
    });
    return updated;
  }
}
