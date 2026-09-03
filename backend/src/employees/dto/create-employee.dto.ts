import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum EmploymentTypeDto {
  TENAGA_BORONGAN = 'TENAGA_BORONGAN',
  TENAGA_ARSIPARIS = 'TENAGA_ARSIPARIS',
}

export class CreateEmployeeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  nik?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsEnum(EmploymentTypeDto)
  employmentType: EmploymentTypeDto;

  @IsDateString()
  joinDate: string;

  @IsOptional()
  @IsDateString()
  trainingEndDate?: string;

  @IsOptional()
  @IsString()
  coordinatorId?: string;

  // Tarif Harian Lepas (Rupiah/hari) — dipakai sebagai basis payroll saat
  // karyawan belum punya kontrak PKWT aktif (§15, mis. masih training).
  @IsOptional()
  @IsInt()
  @Min(0)
  dailyRate?: number;

  // Optional first placement so a new employee isn't left "location-less".
  @IsOptional()
  @IsString()
  initialLocationId?: string;
}
