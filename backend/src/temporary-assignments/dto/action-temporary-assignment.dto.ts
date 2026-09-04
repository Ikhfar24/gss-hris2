import { IsOptional, IsString } from 'class-validator';

export class ActionTemporaryAssignmentDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
