import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enums/role.enum';

export interface AuditLogEntry {
  actorId?: string | null;
  actorRole?: Role | string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  source?: string | null;
  relatedEntityId?: string | null;
}

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  /** Records who changed what, when, from what, to what, and why. */
  async record(entry: AuditLogEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole as Role | undefined,
        actorName: entry.actorName ?? null,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        oldValue: entry.oldValue as any,
        newValue: entry.newValue as any,
        reason: entry.reason ?? null,
        source: entry.source ?? null,
        relatedEntityId: entry.relatedEntityId ?? null,
      },
    });
  }

  /**
   * Log audit entry.
   * Supports both entry object signature and individual parameters.
   */
  async log(
    entryOrAction: AuditLogEntry | string,
    entity?: string,
    entityId?: string | null,
    actorId?: string | null,
    actorRole?: Role | string | null,
    actorName?: string | null,
    actorEmail?: string | null,
    oldValue?: unknown,
    newValue?: unknown,
    reason?: string | null,
    source?: string | null,
    relatedEntityId?: string | null,
  ): Promise<void> {
    if (typeof entryOrAction === 'object' && entryOrAction !== null) {
      return this.record(entryOrAction);
    }
    return this.record({
      action: entryOrAction,
      entity: entity!,
      entityId,
      actorId,
      actorRole,
      actorName,
      actorEmail,
      oldValue,
      newValue,
      reason,
      source,
      relatedEntityId,
    });
  }

  async findByEntity(entity: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
    });
  }
}
