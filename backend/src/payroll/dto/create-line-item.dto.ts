import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum PayrollLineTypeDto {
  EARNING = 'EARNING',
  DEDUCTION = 'DEDUCTION',
}

export class CreateLineItemDto {
  @IsEnum(PayrollLineTypeDto)
  type: PayrollLineTypeDto;

  @IsString()
  label: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;
}
