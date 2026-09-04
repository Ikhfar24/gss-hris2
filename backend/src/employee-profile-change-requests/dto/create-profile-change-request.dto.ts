import { IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ProfileChangeFieldsDto {
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() bankAccountNumber?: string;
  @IsOptional() @IsString() photoUrl?: string;
}

export class CreateProfileChangeRequestDto {
  @ValidateNested()
  @Type(() => ProfileChangeFieldsDto)
  changes: ProfileChangeFieldsDto;

  @IsString()
  @MinLength(3)
  reason: string;
}
