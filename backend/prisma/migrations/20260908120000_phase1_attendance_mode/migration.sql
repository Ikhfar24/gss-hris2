CREATE TYPE "AttendanceMode" AS ENUM ('GEOFENCE', 'MOBILE');

ALTER TABLE "employees"
ADD COLUMN "attendanceMode" "AttendanceMode" NOT NULL DEFAULT 'GEOFENCE';

ALTER TABLE "attendances"
ADD COLUMN "checkInAttendanceMode" "AttendanceMode",
ADD COLUMN "checkOutAttendanceMode" "AttendanceMode";
