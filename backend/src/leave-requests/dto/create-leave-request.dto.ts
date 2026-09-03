import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export enum LeaveTypeDto {
  CUTI = 'CUTI',
  SAKIT = 'SAKIT',
  IZIN_PULANG_AWAL = 'IZIN_PULANG_AWAL',
  IZIN_MENDADAK = 'IZIN_MENDADAK',
  IZIN_LAIN = 'IZIN_LAIN',
  RESIGN = 'RESIGN',
}

export class CreateLeaveRequestDto {
  @IsEnum(LeaveTypeDto)
  type: LeaveTypeDto;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsString()
  @MinLength(3)
  reason: string;

  // data URL, e.g. "data:application/pdf;base64,...." — optional per §13
  @IsOptional()
  @IsString()
  documentBase64?: string;

  // Only honored when the actor is Admin/HR (submitting on behalf of an
  // employee without self-service access) — a Karyawan submitting for
  // themselves gets their own employeeId regardless of this field.
  @IsOptional()
  @IsString()
  employeeId?: string;
}
