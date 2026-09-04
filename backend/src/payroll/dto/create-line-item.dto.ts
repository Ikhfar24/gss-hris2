import { IsEnum, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

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

  @IsString()
  @IsNotEmpty()
  reason: string;
}
