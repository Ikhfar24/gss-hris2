import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  findAll() {
    return this.prisma.client.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Client tidak ditemukan');
    return client;
  }

  async create(dto: CreateClientDto, actorId: string) {
    const client = await this.prisma.client.create({ data: dto });
    await this.auditLog.record({
      actorId,
      action: 'CLIENT_CREATE',
      entity: 'Client',
      entityId: client.id,
      newValue: client,
    });
    return client;
  }

  async update(id: string, dto: UpdateClientDto, actorId: string) {
    const before = await this.findOne(id);
    const updated = await this.prisma.client.update({ where: { id }, data: dto });
    await this.auditLog.record({
      actorId,
      action: 'CLIENT_UPDATE',
      entity: 'Client',
      entityId: id,
      oldValue: before,
      newValue: updated,
    });
    return updated;
  }
}
