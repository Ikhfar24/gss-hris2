import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ReviewPlacementRequestDto {
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
