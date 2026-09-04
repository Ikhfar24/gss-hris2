import { IsEnum, IsString, MinLength, ValidateIf } from 'class-validator';

export enum ProfileChangeDecisionDto { APPROVED = 'APPROVED', REJECTED = 'REJECTED' }

export class ReviewProfileChangeRequestDto {
  @IsEnum(ProfileChangeDecisionDto)
  decision: ProfileChangeDecisionDto;

  @ValidateIf((value) => value.decision === ProfileChangeDecisionDto.REJECTED)
  @IsString()
  @MinLength(3)
  reviewNote?: string;

}
