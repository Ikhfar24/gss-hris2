import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CreatePayrollRunDto {
  @IsOptional()
  @IsUUID()
  payrollPeriodId?: string;

  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @IsOptional()
  @IsDateString()
  periodEnd?: string;
}
