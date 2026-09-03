import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';

@Injectable()
export class CompanySettingsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /** Public — branding must be readable pre-login (e.g. logo on the login page). */
  async get() {
    const settings = await this.prisma.companySettings.findFirst();
    if (settings) return settings;
    // Self-heals if seed hasn't run yet, so the app never has a "no settings" state.
    return this.prisma.companySettings.create({ data: {} });
  }

  async update(dto: UpdateCompanySettingsDto, actorId: string) {
    const before = await this.get();
    const updated = await this.prisma.companySettings.update({
      where: { id: before.id },
      data: { ...dto, updatedById: actorId },
    });

    await this.auditLog.record({
      actorId,
      action: 'COMPANY_SETTINGS_UPDATE',
      entity: 'CompanySettings',
      entityId: updated.id,
      oldValue: before,
      newValue: updated,
    });

    return updated;
  }
}
