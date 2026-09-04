import { IsDateString, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class ReasonDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class RecordPaymentDto extends ReasonDto {
  @IsInt()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  reference: string;

  @IsDateString()
  paidAt: string;
}
