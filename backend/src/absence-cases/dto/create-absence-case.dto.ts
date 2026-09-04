import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateAbsenceCaseDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsDateString()
  date: string;
}
