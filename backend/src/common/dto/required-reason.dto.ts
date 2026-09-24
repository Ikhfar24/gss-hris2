import { IsString, MinLength } from 'class-validator';

export class RequiredReasonDto {
  @IsString()
  @MinLength(3)
  reason: string;
}
