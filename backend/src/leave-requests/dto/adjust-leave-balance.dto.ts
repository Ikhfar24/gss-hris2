import { IsInt, IsString, Max, Min, MinLength, NotEquals } from 'class-validator';

export class AdjustLeaveBalanceDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsInt()
  @NotEquals(0)
  delta: number;

  @IsString()
  @MinLength(3)
  reason: string;
}
