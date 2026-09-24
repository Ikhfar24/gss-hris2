import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';

export class InitializeLeaveBalanceDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsInt()
  @Min(0)
  entitlementDays: number;

  @IsString()
  @MinLength(3)
  reason: string;
}
