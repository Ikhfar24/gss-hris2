import { IsEnum, IsString, MinLength } from 'class-validator';

export enum AttendanceReviewDecisionDto {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class ReviewAttendanceDto {
  @IsEnum(AttendanceReviewDecisionDto)
  decision: AttendanceReviewDecisionDto;

  @IsString()
  @MinLength(5)
  note: string;
}
