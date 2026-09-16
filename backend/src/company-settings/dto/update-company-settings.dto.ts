import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class UpdateCompanySettingsDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  appName?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== '')
  @IsString()
  @Matches(/^\/(?!\/)[A-Za-z0-9._~/-]*$/, { message: 'logoUrl harus berupa path aplikasi, contoh /branding/logo.svg' })
  logoUrl?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== '')
  @IsString()
  @Matches(/^\/(?!\/)[A-Za-z0-9._~/-]*$/, { message: 'faviconUrl harus berupa path aplikasi, contoh /branding/favicon.ico' })
  faviconUrl?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'primaryColor harus berupa warna hex 6 digit' })
  primaryColor?: string;
}
