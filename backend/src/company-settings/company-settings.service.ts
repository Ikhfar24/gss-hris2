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

  async get() {
    const settings = await this.prisma.companySettings.findFirst();
    if (settings) return settings;
    // Self-heals if seed hasn't run yet, so the app never has a "no settings" state.
    return this.prisma.companySettings.create({ data: {} });
  }

  async getBranding() {
    const settings = await this.prisma.companySettings.findFirst({
      select: { companyName: true, appName: true, logoUrl: true, faviconUrl: true, primaryColor: true },
    });
    if (!settings) return { companyName: 'Papaiz.corp', appName: 'Papaiz HR', logoUrl: null, faviconUrl: null, primaryColor: '#001F3F' };
    const safeAsset = (value: string | null) => value && /^\/(?!\/)[A-Za-z0-9._~/-]*$/.test(value) ? value : null;
    return {
      companyName: settings.companyName,
      appName: settings.appName,
      logoUrl: safeAsset(settings.logoUrl),
      faviconUrl: safeAsset(settings.faviconUrl),
      primaryColor: settings.primaryColor && /^#[0-9a-fA-F]{6}$/.test(settings.primaryColor) ? settings.primaryColor : '#001F3F',
    };
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
