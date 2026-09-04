import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ReviewOvertimeRequestDto {
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
