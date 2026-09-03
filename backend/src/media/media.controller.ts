import { Controller, Get, Param, StreamableFile, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { MediaService } from './media.service';

@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private media: MediaService) {}

  @Get('selfies/:employeeId/:filename')
  selfie(@Param('employeeId') employeeId: string, @Param('filename') filename: string, @CurrentUser() actor: AuthenticatedUser): Promise<StreamableFile> {
    return this.media.openSelfie(employeeId, filename, actor);
  }

  @Get('leave-documents/:employeeId/:filename')
  leaveDocument(@Param('employeeId') employeeId: string, @Param('filename') filename: string, @CurrentUser() actor: AuthenticatedUser): Promise<StreamableFile> {
    return this.media.openLeaveDocument(employeeId, filename, actor);
  }
}
