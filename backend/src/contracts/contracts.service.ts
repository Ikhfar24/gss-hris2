import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateContractDto } from './dto/create-contract.dto';

@Injectable()
export class ContractsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  findByEmployee(employeeId: string) {
    return this.prisma.contract.findMany({
      where: { employeeId },
      orderBy: { startDate: 'desc' },
    });
  }

  async create(dto: CreateContractDto, actorOrId: AuthenticatedUser | string) {
    const actorId = typeof actorOrId === 'string' ? actorOrId : actorOrId.userId;
    const actor = typeof actorOrId === 'string' ? null : actorOrId;
    const { employeeId, startDate, endDate, ...rest } = dto;
    const contract = await this.prisma.contract.create({
      data: {
        employeeId,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        ...rest,
      },
    });

    await this.auditLog.record({
      actorId,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      actorRole: actor?.role,
      action: 'CONTRACT_CREATE',
      entity: 'Contract',
      entityId: contract.id,
      newValue: contract,
    });

    return contract;
  }
}
