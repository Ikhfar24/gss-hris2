import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ReviewTemporaryAssignmentDto {
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
