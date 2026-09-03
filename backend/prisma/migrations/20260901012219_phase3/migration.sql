-- CreateEnum
CREATE TYPE "GpsStatus" AS ENUM ('OK', 'OUT_OF_RADIUS', 'UNAVAILABLE', 'SUSPICIOUS');

-- CreateEnum
CREATE TYPE "FaceVerificationStatus" AS ENUM ('NOT_VERIFIED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "AttendanceValidationStatus" AS ENUM ('VALID', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "LatenessStatus" AS ENUM ('ON_TIME', 'LATE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('NATIONAL', 'CUTI_BERSAMA', 'LOCATION_SPECIFIC');

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HolidayType" NOT NULL DEFAULT 'NATIONAL',
    "locationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkInLatitude" DOUBLE PRECISION,
    "checkInLongitude" DOUBLE PRECISION,
    "checkInDistanceMeters" DOUBLE PRECISION,
    "checkInSelfieUrl" TEXT,
    "checkInGpsStatus" "GpsStatus",
    "checkInFaceStatus" "FaceVerificationStatus",
    "checkInMockLocationFlag" BOOLEAN NOT NULL DEFAULT false,
    "checkInDeviceInfo" TEXT,
    "latenessStatus" "LatenessStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "checkOutAt" TIMESTAMP(3),
    "checkOutLatitude" DOUBLE PRECISION,
    "checkOutLongitude" DOUBLE PRECISION,
    "checkOutDistanceMeters" DOUBLE PRECISION,
    "checkOutSelfieUrl" TEXT,
    "checkOutGpsStatus" "GpsStatus",
    "checkOutFaceStatus" "FaceVerificationStatus",
    "checkOutMockLocationFlag" BOOLEAN NOT NULL DEFAULT false,
    "checkOutDeviceInfo" TEXT,
    "validationStatus" "AttendanceValidationStatus" NOT NULL DEFAULT 'VALID',
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_locationId_key" ON "holidays"("date", "locationId");

-- CreateIndex
CREATE INDEX "attendances_date_idx" ON "attendances"("date");

-- CreateIndex
CREATE INDEX "attendances_locationId_date_idx" ON "attendances"("locationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_employeeId_date_key" ON "attendances"("employeeId", "date");

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
