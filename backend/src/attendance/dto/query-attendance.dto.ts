import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum ValidationStatusFilter {
  VALID = 'VALID',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
}

export class QueryAttendanceDto {
  @IsOptional()
  @IsDateString()
  date?: string; // defaults to today if omitted

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(ValidationStatusFilter)
  validationStatus?: ValidationStatusFilter;
}

// Used by GET /attendance/open — deliberately date-range based rather than
// single-date, since "lupa check-out" (§11.5) is about scanning back over
// past days, not just today.
export class QueryOpenAttendanceDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class QueryMyHistoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
