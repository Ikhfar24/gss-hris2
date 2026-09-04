import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum EmploymentTypeDto {
  TENAGA_BORONGAN = 'TENAGA_BORONGAN',
  TENAGA_ARSIPARIS = 'TENAGA_ARSIPARIS',
}

export enum GenderDto { MALE = 'MALE', FEMALE = 'FEMALE' }
export enum EmployeeStatusCreateDto { TRAINING = 'TRAINING', ACTIVE = 'ACTIVE', INACTIVE = 'INACTIVE', ON_LEAVE = 'ON_LEAVE', RESIGNED = 'RESIGNED', TERMINATED = 'TERMINATED' }

export class CreateEmployeeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  nik?: string;

  @IsOptional()
  @IsString()
  employeeNumber?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(GenderDto)
  gender?: GenderDto;

  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  bpjsKesehatanNumber?: string;

  @IsOptional()
  @IsString()
  bpjsKetenagakerjaanNumber?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsEnum(EmploymentTypeDto)
  employmentType: EmploymentTypeDto;

  @IsOptional()
  @IsEnum(EmployeeStatusCreateDto)
  status?: EmployeeStatusCreateDto;

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

  @IsOptional()
  @IsBoolean()
  attendanceRequired?: boolean;

  @IsOptional()
  @IsString()
  attendanceExemptionReason?: string;

  // Optional first placement so a new employee isn't left "location-less".
  @IsOptional()
  @IsString()
  initialLocationId?: string;
}
