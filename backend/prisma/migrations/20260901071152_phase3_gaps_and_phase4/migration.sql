-- CreateEnum
CREATE TYPE "EvidenceFailureReason" AS ENUM ('GPS_FAILED', 'CAMERA_FAILED', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('CUTI', 'SAKIT', 'IZIN_PULANG_AWAL', 'IZIN_MENDADAK', 'IZIN_LAIN', 'RESIGN');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "GpsStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "checkInClientRecordedAt" TIMESTAMP(3),
ADD COLUMN     "checkInDeviceId" TEXT,
ADD COLUMN     "checkInFailureNote" TEXT,
ADD COLUMN     "checkInFailureReason" "EvidenceFailureReason",
ADD COLUMN     "checkInSyncedOffline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkOutClientRecordedAt" TIMESTAMP(3),
ADD COLUMN     "checkOutDeviceId" TEXT,
ADD COLUMN     "checkOutFailureNote" TEXT,
ADD COLUMN     "checkOutFailureReason" "EvidenceFailureReason",
ADD COLUMN     "checkOutSyncedOffline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "correctedAt" TIMESTAMP(3),
ADD COLUMN     "correctedById" TEXT,
ADD COLUMN     "correctionNote" TEXT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "resignDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "employee_devices" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "label" TEXT,
    "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL,
    "resetById" TEXT,
    "resetAt" TIMESTAMP(3),

    CONSTRAINT "employee_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "reason" TEXT NOT NULL,
    "documentUrl" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_devices_employeeId_key" ON "employee_devices"("employeeId");

-- CreateIndex
CREATE INDEX "leave_requests_employeeId_status_idx" ON "leave_requests"("employeeId", "status");

-- AddForeignKey
ALTER TABLE "employee_devices" ADD CONSTRAINT "employee_devices_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
