import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
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

  async create(dto: CreateContractDto, actorId: string) {
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
      action: 'CONTRACT_CREATE',
      entity: 'Contract',
      entityId: contract.id,
      newValue: contract,
    });

    return contract;
  }
}
