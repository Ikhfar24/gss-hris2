import { IsDateString, IsString, MinLength } from 'class-validator';

export class CreateOvertimeRequestDto {
  @IsDateString()
  date: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsString()
  @MinLength(3)
  reason: string;
}
