import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreatePlacementRequestDto {
  @IsString()
  employeeId: string;

  @IsString()
  destinationLocationId: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsString()
  reason: string;
}
