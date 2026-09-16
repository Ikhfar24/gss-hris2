import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateIf } from 'class-validator';

export enum EvidenceFailureReasonDto {
  GPS_FAILED = 'GPS_FAILED',
  CAMERA_FAILED = 'CAMERA_FAILED',
  OTHER = 'OTHER',
}

export class CheckInDto {
  // GEOFENCE permits the documented GPS-failure fallback. MOBILE requires a
  // complete fix in AttendanceService because this is an employee policy.
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number;

  // Reported by the client app when it detects a mock-location provider.
  // Per §11.4 this is a soft signal for HR review, not a guaranteed
  // fake-GPS detector — the system never promises 100% detection.
  @IsOptional()
  @IsBoolean()
  mockLocationDetected?: boolean;

  // data URL, e.g. "data:image/jpeg;base64,...." — optional for the same
  // reason as latitude/longitude (§11.5 "kamera gagal").
  @IsOptional()
  @IsString()
  selfieBase64?: string;

  // Required together whenever latitude/longitude or selfieBase64 is
  // missing — see AttendanceService.resolveEvidence for the actual check.
  @IsOptional()
  @IsEnum(EvidenceFailureReasonDto)
  failureReason?: EvidenceFailureReasonDto;

  @ValidateIf((o) => !!o.failureReason)
  @IsString()
  @MinLength(3)
  failureNote?: string;

  // Set by the client when this check-in was captured offline and is only
  // being submitted now that connectivity is back (§11.5 "absensi offline").
  // The server trusts this as the real moment of check-in (kept alongside
  // the server receipt time), and always flags the record for HR review.
  @IsOptional()
  @IsDateString()
  clientRecordedAt?: string;
}
