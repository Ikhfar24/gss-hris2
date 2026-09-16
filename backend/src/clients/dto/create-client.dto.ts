import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeReferenceCode, REFERENCE_CODE_PATTERN } from '../../common/utils/reference-code.util';

export class CreateClientDto {
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
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
