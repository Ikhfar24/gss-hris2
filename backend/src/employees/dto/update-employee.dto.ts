import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { EmploymentTypeDto } from './create-employee.dto';

export enum EmployeeStatusDto {
  TRAINING = 'TRAINING',
  ACTIVE = 'ACTIVE',
  ON_LEAVE = 'ON_LEAVE',
  RESIGNED = 'RESIGNED',
  TERMINATED = 'TERMINATED',
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nik?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(EmploymentTypeDto)
  employmentType?: EmploymentTypeDto;

  @IsOptional()
  @IsEnum(EmployeeStatusDto)
  status?: EmployeeStatusDto;

  @IsOptional()
  @IsDateString()
  trainingEndDate?: string;

  @IsOptional()
  @IsString()
  coordinatorId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  dailyRate?: number;

  @IsOptional()
  @IsString()
  reason?: string; // required-by-convention when status changes (e.g. resign/terminate)
}
