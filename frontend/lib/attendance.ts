export type AttendanceMode = 'GEOFENCE' | 'MOBILE';

export interface ApprovedFullDayAbsence {
  id: string;
  type: 'CUTI' | 'SAKIT' | 'IZIN_MENDADAK' | 'IZIN_LAIN';
  startDate: string;
  endDate: string | null;
  status: 'APPROVED';
}

export function approvedAbsenceLabel(type: ApprovedFullDayAbsence['type']) {
  if (type === 'CUTI') return 'Cuti';
  if (type === 'SAKIT') return 'Sakit';
  return 'Izin tidak masuk';
}

export interface AttendanceRecord {
  id: string;
  date?: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInGpsStatus: string | null;
  checkInDistanceMeters: number | null;
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkInAccuracyMeters?: number | null;
  checkInGeofenceLatitude?: number | null;
  checkInGeofenceLongitude?: number | null;
  checkInGeofenceRadiusMeters?: number | null;
  checkInLocationName?: string | null;
  checkInSelfieUrl?: string | null;
  checkInAttendanceMode?: AttendanceMode | null;
  checkOutLatitude?: number | null;
  checkOutLongitude?: number | null;
  checkOutAccuracyMeters?: number | null;
  checkOutDistanceMeters?: number | null;
  checkOutGeofenceLatitude?: number | null;
  checkOutGeofenceLongitude?: number | null;
  checkOutGeofenceRadiusMeters?: number | null;
  checkOutLocationName?: string | null;
  checkOutGpsStatus?: string | null;
  checkOutSelfieUrl?: string | null;
  checkOutAttendanceMode?: AttendanceMode | null;
  checkOutSource?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  reviews?: { id: string; decision: string; note: string; reviewedAt: string; reviewer?: { name: string; role: string } | null }[];
  employee?: { id: string; name: string; employmentType: string };
  latenessStatus: string;
  validationStatus: string;
  forgottenCheckout?: boolean;
  location: { name: string; radiusMeters: number };
}

export const validationLabels: Record<string, string> = {
  VALID: 'Valid',
  NEEDS_REVIEW: 'Perlu ditinjau',
  APPROVED_AFTER_REVIEW: 'Disetujui',
  REJECTED: 'Ditolak',
};

export function attendanceStatus(record: AttendanceRecord) {
  if (record.validationStatus === 'REJECTED') return 'Ditolak';
  if (record.forgottenCheckout) return 'Check-out otomatis';
  if (!record.checkOutAt) return 'Belum check-out';
  return 'Hadir';
}

export function latenessLabel(status: string) {
  if (status === 'LATE') return 'Datang terlambat';
  if (status === 'ON_TIME') return 'Datang tepat waktu';
  return 'Tidak ada penilaian keterlambatan';
}
