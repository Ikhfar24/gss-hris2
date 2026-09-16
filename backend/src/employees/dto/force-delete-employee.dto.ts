import { Equals, IsString, MinLength } from 'class-validator';

export class ForceDeleteEmployeeDto {
  @IsString()
  @MinLength(3)
  reason: string;

  @IsString()
  @Equals('HAPUS', { message: 'Konfirmasi Force Delete harus persis HAPUS' })
  confirmation: string;
}
