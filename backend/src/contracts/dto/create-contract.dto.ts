import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum ContractTypeDto {
  PKWT = 'PKWT',
  PKWTT = 'PKWTT',
  OTHER = 'OTHER',
}

export class CreateContractDto {
  @IsString()
  employeeId: string;

  @IsOptional()
  @IsEnum(ContractTypeDto)
  type?: ContractTypeDto;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  documentUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Gaji pokok bulanan (Rupiah) — basis payroll saat kontrak ini aktif (§15).
  @IsOptional()
  @IsInt()
  @Min(0)
  baseSalary?: number;
}
