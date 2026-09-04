import { IsIn, IsOptional } from 'class-validator';

export class QueryAbsenceAttentionDto {
  @IsOptional()
  @IsIn(['PENDING_EXPLANATION', 'CONFIRMED_ALPHA'], { each: true })
  status?: 'PENDING_EXPLANATION' | 'CONFIRMED_ALPHA' | ('PENDING_EXPLANATION' | 'CONFIRMED_ALPHA')[];
}
