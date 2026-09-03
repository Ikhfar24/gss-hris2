import { IsString, MinLength } from 'class-validator';

export class ResetDeviceDto {
  @IsString()
  @MinLength(5)
  reason: string;
}
