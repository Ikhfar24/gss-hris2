import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export enum HolidayTypeDto {
  NATIONAL = 'NATIONAL',
  CUTI_BERSAMA = 'CUTI_BERSAMA',
  LOCATION_SPECIFIC = 'LOCATION_SPECIFIC',
}

export class CreateHolidayDto {
  @IsDateString()
  date: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsEnum(HolidayTypeDto)
  type?: HolidayTypeDto;

  @IsOptional()
  @IsString()
  locationId?: string;
}
