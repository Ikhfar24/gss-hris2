import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeReferenceCode, REFERENCE_CODE_PATTERN } from '../../common/utils/reference-code.util';

export class CreateLocationDto {
  @Transform(({ value }) => typeof value === 'string' ? normalizeReferenceCode(value) : value)
  @IsString()
  @IsNotEmpty()
  @Matches(REFERENCE_CODE_PATTERN, { message: 'referenceCode hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung' })
  referenceCode: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
