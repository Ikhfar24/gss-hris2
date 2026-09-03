import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ReviewLeaveRequestDto {
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
