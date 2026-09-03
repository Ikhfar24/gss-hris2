import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Reason is required by convention (not enforced at DTO level) whenever
  // role/isActive changes — enforced in the service so audit log entries
  // are meaningful, per PRD section 9.3 (every override must be recorded).
  @IsOptional()
  @IsString()
  reason?: string;
}
