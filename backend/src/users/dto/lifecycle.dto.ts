import { IsString, MinLength } from 'class-validator';

export class LifecycleDto {
  @IsString()
  @MinLength(3)
  reason: string;
}

export class AdminResetPasswordDto extends LifecycleDto {
  @IsString()
  @MinLength(8)
  password: string;
}
