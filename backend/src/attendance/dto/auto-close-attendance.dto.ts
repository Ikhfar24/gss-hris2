import { IsNotEmpty, IsString } from 'class-validator';

export class AutoCloseAttendanceDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
