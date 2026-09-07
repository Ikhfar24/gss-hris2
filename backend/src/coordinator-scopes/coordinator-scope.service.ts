import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmploymentType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CoordinatorScopeService {
  constructor(private prisma: PrismaService) {}

  async getTypes(userId: string): Promise<EmploymentType[]> {
    const scopes = await this.prisma.coordinatorScope.findMany({ where: { coordinatorUserId: userId, active: true }, select: { employmentType: true } });
    return scopes.map((scope) => scope.employmentType);
  }

  async employeeWhere(userId: string): Promise<Prisma.EmployeeWhereInput> {
    return { employmentType: { in: await this.getTypes(userId) } };
  }

  async queryWhere(userId: string): Promise<{ employee: Prisma.EmployeeWhereInput }> {
    return { employee: await this.employeeWhere(userId) };
  }

  async assertEmployee(userId: string, employee: { employmentType: EmploymentType | string }) {
    if (!(await this.getTypes(userId)).includes(employee.employmentType as EmploymentType)) {
      throw new ForbiddenException('Anda hanya dapat mengakses karyawan dalam cakupan jenis tenaga Anda');
    }
  }

  async list() {
    return this.prisma.coordinatorScope.findMany({ include: { coordinator: { select: { id: true, name: true, email: true, role: true, isActive: true } } }, orderBy: [{ coordinatorUserId: 'asc' }, { employmentType: 'asc' }] });
  }

  async set(coordinatorUserId: string, employmentType: EmploymentType, active: boolean, actor: { userId: string; role: Role | string }) {
    const coordinator = await this.prisma.user.findUnique({ where: { id: coordinatorUserId }, select: { id: true, role: true } });
    if (!coordinator) throw new NotFoundException('User koordinator tidak ditemukan');
    if (coordinator.role !== Role.KOORDINATOR) throw new ForbiddenException('Scope hanya dapat diberikan kepada user dengan role Koordinator');
    const scope = await this.prisma.coordinatorScope.upsert({ where: { coordinatorUserId_employmentType: { coordinatorUserId, employmentType } }, create: { coordinatorUserId, employmentType, active }, update: { active } });
    await this.prisma.auditLog.create({ data: { actorId: actor.userId, actorRole: actor.role as Role, action: active ? 'COORDINATOR_SCOPE_ACTIVATE' : 'COORDINATOR_SCOPE_DEACTIVATE', entity: 'CoordinatorScope', entityId: scope.id, newValue: { coordinatorUserId, employmentType, active }, source: 'COORDINATOR_SCOPE_ADMIN', relatedEntityId: coordinatorUserId } });
    return scope;
  }
}
