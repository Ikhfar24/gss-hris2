import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export enum ValidationStatusDto {
  VALID = 'VALID',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
}

// HR correction (§11.5 "koreksi absensi"). Every field is optional except
// `reason` — HR only sends what actually needs fixing (e.g. just
// checkOutAt for a forgotten check-out). Explicit `clearCheckOut` exists
// because "no value" and "clear this field" aren't the same thing in a
// PATCH body.
export class CorrectAttendanceDto {
  @IsOptional()
  @IsDateString()
  checkInAt?: string;

  @IsOptional()
  @IsDateString()
  checkOutAt?: string;

  @IsOptional()
  clearCheckOut?: boolean;

  @IsOptional()
  @IsEnum(ValidationStatusDto)
  validationStatus?: ValidationStatusDto;

  @IsString()
  @MinLength(5)
  reason: string;
}
