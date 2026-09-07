import { ArrayMinSize, IsArray, IsBoolean, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { CreateEmployeeDto } from './create-employee.dto';

export class EmployeeImportRowDto extends CreateEmployeeDto {}

export class ImportEmployeesDto {
  @IsArray()
  @ArrayMinSize(1)
  // Row validation is performed as a batch by the service so callers receive
  // every invalid row rather than the first validation-pipe rejection.
  @IsObject({ each: true })
  rows: EmployeeImportRowDto[];

  // Imports are previews unless the caller positively requests a commit.
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsBoolean()
  commit?: boolean;
}

export class BulkDeactivateEmployeesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  employeeIds: string[];

  @IsString()
  @MinLength(3)
  reason: string;
}
