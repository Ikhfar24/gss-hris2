import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class ResolveAbsenceCaseDto {
  @IsIn(['EXCUSE', 'CONFIRM_ALPHA'])
  decision: 'EXCUSE' | 'CONFIRM_ALPHA';

  @IsString()
  @IsNotEmpty()
  reason: string;
}
