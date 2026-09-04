import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateTemporaryAssignmentDto {
  @IsString()
  employeeId: string;

  @IsString()
  originPlacementId: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsString()
  locationId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  coordinationNote?: string;
}
