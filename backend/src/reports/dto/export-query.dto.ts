import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export enum ExportFormat {
  XLSX = 'xlsx',
  PDF = 'pdf',
}

// Shared query shape for all §16 reports. Not every field applies to every
// report (e.g. `status` only makes sense for leave requests) — each
// service method just ignores the fields it doesn't use.
export class ExportQueryDto {
  @IsEnum(ExportFormat)
  format: ExportFormat;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
