import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  latitude?: number;

  @IsOptional()
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(50)
  radiusMeters?: number;

  @IsOptional()
  @IsString()
  checkInTime?: string; // "HH:mm"

  @IsOptional()
  @IsString()
  checkOutTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  toleranceMin?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workDays?: number[]; // 0=Minggu .. 6=Sabtu

  @IsOptional()
  @IsString()
  clientId?: string;
}
