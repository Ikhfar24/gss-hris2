import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export enum EvidenceFailureReasonDto {
  GPS_FAILED = 'GPS_FAILED',
  CAMERA_FAILED = 'CAMERA_FAILED',
  OTHER = 'OTHER',
}

export class CheckInDto {
  // GPS is normally required, but §11.5 explicitly leaves "GPS gagal" open.
  // MVP policy: allow proceeding WITHOUT coordinates only if failureReason +
  // failureNote are given — enforced in the service, not here, since it's a
  // cross-field rule (see AttendanceService.resolveEvidence).
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

  @IsOptional()
  @IsString()
  deviceInfo?: string;

  // Opaque client-generated identifier persisted in browser storage, used
  // for device binding (§11.5 "device binding atau pembatasan perangkat").
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  deviceId: string;

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
