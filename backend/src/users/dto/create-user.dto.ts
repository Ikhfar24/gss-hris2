import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '../../common/enums/role.enum';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email: string;

  @IsEnum(Role)
  role: Role;

  @IsOptional()
  @IsString()
  employeeId?: string;
}
