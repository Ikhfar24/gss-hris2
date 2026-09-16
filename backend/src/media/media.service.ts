import { ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { resolveStoredFile } from '../common/utils/file-storage.util';
import { CoordinatorScopeService } from '../coordinator-scopes/coordinator-scope.service';

const MANAGEMENT = [Role.ADMIN_HR, Role.SYSTEM_ADMIN, Role.DIREKTUR];
const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };

@Injectable()
export class MediaService {
  constructor(private prisma: PrismaService, private scopes: CoordinatorScopeService) {}

  async openSelfie(employeeId: string, filename: string, actor: AuthenticatedUser): Promise<StreamableFile> {
    const paths = this.mediaPaths('selfies', employeeId, filename);
    const attendance = await this.prisma.attendance.findFirst({
      where: { employeeId, OR: [{ checkInSelfieUrl: { in: paths } }, { checkOutSelfieUrl: { in: paths } }] },
      include: { employee: { select: { employmentType: true } } },
    });
    if (!attendance) throw new NotFoundException('File selfie tidak ditemukan');
    await this.assertAccess(employeeId, attendance.employee, actor);
    return this.file('selfies', employeeId, filename);
  }

  async openLeaveDocument(employeeId: string, filename: string, actor: AuthenticatedUser): Promise<StreamableFile> {
    const paths = this.mediaPaths('leave-documents', employeeId, filename);
    const request = await this.prisma.leaveRequest.findFirst({
      where: { employeeId, documentUrl: { in: paths } },
      include: { employee: { select: { employmentType: true } } },
    });
    if (!request) throw new NotFoundException('Dokumen tidak ditemukan');
    if (actor.role === Role.DIREKTUR && request.status !== 'PENDING_DIRECTOR') {
      throw new ForbiddenException('Direktur hanya dapat membuka dokumen pada tahap persetujuan Direktur');
    }
    await this.assertAccess(employeeId, request.employee, actor);
    return this.file('leave-documents', employeeId, filename);
  }

  async openProfilePhoto(employeeId: string, filename: string, actor: AuthenticatedUser): Promise<StreamableFile> {
    const paths = this.mediaPaths('profile-photos', employeeId, filename);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, photoUrl: { in: paths } },
      select: { employmentType: true },
    });
    if (!employee) throw new NotFoundException('Foto profil tidak ditemukan');
    await this.assertAccess(employeeId, employee, actor);
    return this.file('profile-photos', employeeId, filename);
  }

  private mediaPaths(kind: 'selfies' | 'leave-documents' | 'profile-photos', employeeId: string, filename: string) {
    const { relative } = resolveStoredFile(kind, employeeId, filename);
    const legacy = `/uploads/${relative}`;
    const protectedPath = kind === 'selfies'
      ? `/api/v1/media/selfies/${employeeId}/${filename}`
      : kind === 'profile-photos'
        ? `/api/v1/media/profile-photos/${employeeId}/${filename}`
        : `/api/v1/media/leave-documents/${employeeId}/${filename}`;
    return [legacy, protectedPath];
  }

  private async assertAccess(employeeId: string, employee: { employmentType: string }, actor: AuthenticatedUser) {
    if (MANAGEMENT.includes(actor.role as Role)) return;
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { employeeId: true } });
    if (user?.employeeId === employeeId) return;
    if (actor.role === Role.KOORDINATOR) { await this.scopes.assertEmployee(actor.userId, employee); return; }
    throw new ForbiddenException('Anda tidak berhak mengakses file ini');
  }

  private file(kind: 'selfies' | 'leave-documents' | 'profile-photos', employeeId: string, filename: string) {
    const { absolute } = resolveStoredFile(kind, employeeId, filename);
    if (!existsSync(absolute)) throw new NotFoundException('File tidak ditemukan di penyimpanan');
    return new StreamableFile(createReadStream(absolute), { type: MIME[extname(filename).toLowerCase()] ?? 'application/octet-stream' });
  }
}
