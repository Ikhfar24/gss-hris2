import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export enum RevisionLineTypeDto {
  EARNING = 'EARNING',
  DEDUCTION = 'DEDUCTION',
}

export class CreatePayrollCycleSettingDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsInt() @Min(1) @Max(31) startDay: number;
  @IsInt() @Min(1) @Max(31) endDay: number;
}

export class UpdatePayrollCycleSettingDto {
  @IsOptional() @IsInt() @Min(1) @Max(31) startDay?: number;
  @IsOptional() @IsInt() @Min(1) @Max(31) endDay?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreatePayrollPeriodDto {
  @IsUUID() cycleSettingId: string;
  @IsDateString() periodStart: string;
  @IsDateString() periodEnd: string;
}

export class CreatePayrollRevisionItemDto {
  @IsUUID() payrollSlipId: string;
  @IsEnum(RevisionLineTypeDto) type: RevisionLineTypeDto;
  @IsString() @IsNotEmpty() label: string;
  @IsInt() @Min(1) amount: number;
  @IsString() @IsNotEmpty() reason: string;
}

export class CreatePayrollRevisionDto {
  @IsString() @IsNotEmpty() reason: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreatePayrollRevisionItemDto)
  items: CreatePayrollRevisionItemDto[];
}

export class RevisionActionDto {
  @IsString() @IsNotEmpty() note: string;
}
