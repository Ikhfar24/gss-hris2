import { IsNotEmpty, IsString } from 'class-validator';

export class SubmitAbsenceExplanationDto {
  @IsString()
  @IsNotEmpty()
  explanation: string;
}
