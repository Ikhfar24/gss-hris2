import { Controller, Get, Header, Param, StreamableFile, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { MediaService } from './media.service';

@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private media: MediaService) {}

  @Get('selfies/:employeeId/:filename')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  selfie(@Param('employeeId') employeeId: string, @Param('filename') filename: string, @CurrentUser() actor: AuthenticatedUser): Promise<StreamableFile> {
    return this.media.openSelfie(employeeId, filename, actor);
  }

  @Get('leave-documents/:employeeId/:filename')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @Header('Content-Disposition', 'attachment')
  leaveDocument(@Param('employeeId') employeeId: string, @Param('filename') filename: string, @CurrentUser() actor: AuthenticatedUser): Promise<StreamableFile> {
    return this.media.openLeaveDocument(employeeId, filename, actor);
  }

  @Get('profile-photos/:employeeId/:filename')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  profilePhoto(@Param('employeeId') employeeId: string, @Param('filename') filename: string, @CurrentUser() actor: AuthenticatedUser): Promise<StreamableFile> {
    return this.media.openProfilePhoto(employeeId, filename, actor);
  }
}
