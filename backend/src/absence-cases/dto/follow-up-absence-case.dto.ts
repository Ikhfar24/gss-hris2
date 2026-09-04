import { IsNotEmpty, IsString } from 'class-validator';

export class FollowUpAbsenceCaseDto {
  @IsString()
  @IsNotEmpty()
  note: string;
}
