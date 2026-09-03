-- Batch 2 is intentionally additive. Existing Phase 1-6 rows retain their
-- current meaning; nullable workflow fields are populated only by new flows.

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');
CREATE TYPE "EmployeeProfileChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "AttendancePayableStatus" AS ENUM ('PAYABLE', 'PENDING_REVIEW', 'NOT_PAYABLE');
CREATE TYPE "AttendanceReviewDecision" AS ENUM ('APPROVED', 'REJECTED');
CREATE TYPE "AttendanceCheckoutSource" AS ENUM ('EMPLOYEE', 'SYSTEM_AUTO_CLOSED', 'HR_CORRECTION');
CREATE TYPE "AbsenceCaseStatus" AS ENUM ('PENDING_EXPLANATION', 'CONFIRMED_ALPHA', 'EXCUSED');
CREATE TYPE "LeaveApprovalStage" AS ENUM ('COORDINATOR', 'HR', 'DIRECTOR');
CREATE TYPE "LeaveApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');
CREATE TYPE "LeaveBalanceTransactionType" AS ENUM ('ENTITLEMENT', 'APPROVED_LEAVE', 'MANUAL_ADJUSTMENT', 'REVERSAL');
CREATE TYPE "OvertimeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "TemporaryAssignmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "PayrollRevisionStatus" AS ENUM ('DRAFT', 'PENDING_DIRECTOR_APPROVAL', 'APPROVED', 'REJECTED', 'FINALIZED', 'CANCELLED');

-- AlterEnum: values are appended so historical enum values remain valid.
ALTER TYPE "PlacementStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "AttendanceValidationStatus" ADD VALUE IF NOT EXISTS 'APPROVED_AFTER_REVIEW';
ALTER TYPE "AttendanceValidationStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "LeaveStatus" ADD VALUE IF NOT EXISTS 'PENDING_COORDINATOR';
ALTER TYPE "LeaveStatus" ADD VALUE IF NOT EXISTS 'PENDING_HR';
ALTER TYPE "LeaveStatus" ADD VALUE IF NOT EXISTS 'PENDING_DIRECTOR';
ALTER TYPE "PayrollRunStatus" ADD VALUE IF NOT EXISTS 'PENDING_DIRECTOR_APPROVAL';

-- AlterTable: profile and workflow fields are nullable/additive for legacy data.
ALTER TABLE "employees"
  ADD COLUMN "employeeNumber" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "dateOfBirth" DATE,
  ADD COLUMN "gender" "Gender",
  ADD COLUMN "bankAccountNumber" TEXT,
  ADD COLUMN "bpjsKesehatanNumber" TEXT,
  ADD COLUMN "bpjsKetenagakerjaanNumber" TEXT,
  ADD COLUMN "jobTitle" TEXT,
  ADD COLUMN "photoUrl" TEXT,
  ADD COLUMN "attendanceRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "attendanceExemptionReason" TEXT;

ALTER TABLE "attendances"
  ADD COLUMN "payableStatus" "AttendancePayableStatus",
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "checkOutSource" "AttendanceCheckoutSource",
  ADD COLUMN "autoClosedAt" TIMESTAMP(3);

ALTER TABLE "leave_requests"
  ADD COLUMN "medicalDocumentUrl" TEXT,
  ADD COLUMN "requiresMedicalDocument" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "payroll_runs"
  ADD COLUMN "payrollPeriodId" TEXT,
  ADD COLUMN "financeReviewedById" TEXT,
  ADD COLUMN "financeReviewedAt" TIMESTAMP(3),
  ADD COLUMN "directorApprovedById" TEXT,
  ADD COLUMN "directorApprovedAt" TIMESTAMP(3);

-- Backfill only the explicit role exemption in the specification. All other
-- linked or unlinked legacy employees remain attendance-required by default.
UPDATE "employees" AS e
SET "attendanceRequired" = false,
    "attendanceExemptionReason" = 'Role exempt from mandatory attendance'
FROM "users" AS u
WHERE u."employeeId" = e.id
  AND u.role IN ('DIREKTUR', 'KOMISARIS');

-- CreateTable
CREATE TABLE "employee_profile_change_requests" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "requestedChanges" JSONB NOT NULL,
  "status" "EmployeeProfileChangeStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "appliedChanges" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employee_profile_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_reviews" (
  "id" TEXT NOT NULL,
  "attendanceId" TEXT NOT NULL,
  "decision" "AttendanceReviewDecision" NOT NULL,
  "note" TEXT NOT NULL,
  "reviewedById" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "absence_cases" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "status" "AbsenceCaseStatus" NOT NULL DEFAULT 'PENDING_EXPLANATION',
  "explanation" TEXT,
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "absence_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leave_approvals" (
  "id" TEXT NOT NULL,
  "leaveRequestId" TEXT NOT NULL,
  "stage" "LeaveApprovalStage" NOT NULL,
  "decision" "LeaveApprovalDecision" NOT NULL,
  "note" TEXT,
  "decidedById" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leave_balances" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "entitlementDays" INTEGER NOT NULL,
  "usedDays" INTEGER NOT NULL DEFAULT 0,
  "remainingDays" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leave_balance_transactions" (
  "id" TEXT NOT NULL,
  "leaveBalanceId" TEXT NOT NULL,
  "leaveRequestId" TEXT,
  "type" "LeaveBalanceTransactionType" NOT NULL,
  "daysDelta" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "reason" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_balance_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "overtime_requests" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "startTime" TIMESTAMP(3),
  "endTime" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "status" "OvertimeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "temporary_assignments" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "originPlacementId" TEXT NOT NULL,
  "clientId" TEXT,
  "locationId" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "coordinationNote" TEXT,
  "status" "TemporaryAssignmentStatus" NOT NULL DEFAULT 'PENDING',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvalNote" TEXT,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "temporary_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "temporary_assignments_date_order" CHECK ("endDate" >= "startDate")
);

CREATE TABLE "payroll_cycle_settings" (
  "id" TEXT NOT NULL,
  "clientId" TEXT,
  "locationId" TEXT,
  "startDay" INTEGER NOT NULL,
  "endDay" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_cycle_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_cycle_settings_scope" CHECK (("clientId" IS NULL) <> ("locationId" IS NULL)),
  CONSTRAINT "payroll_cycle_settings_days" CHECK ("startDay" BETWEEN 1 AND 31 AND "endDay" BETWEEN 1 AND 31)
);

CREATE TABLE "payroll_periods" (
  "id" TEXT NOT NULL,
  "cycleSettingId" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_periods_date_order" CHECK ("periodEnd" >= "periodStart")
);

CREATE TABLE "payroll_revisions" (
  "id" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "status" "PayrollRevisionStatus" NOT NULL DEFAULT 'DRAFT',
  "reason" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "directorApprovedById" TEXT,
  "directorApprovedAt" TIMESTAMP(3),
  "approvalNote" TEXT,
  "finalizedById" TEXT,
  "finalizedAt" TIMESTAMP(3),
  "netAdjustment" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_revision_items" (
  "id" TEXT NOT NULL,
  "payrollRevisionId" TEXT NOT NULL,
  "payrollSlipId" TEXT NOT NULL,
  "type" "PayrollLineType" NOT NULL,
  "label" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "previousValue" JSONB,
  "newValue" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_revision_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeNumber_key" ON "employees"("employeeNumber");
CREATE INDEX "placements_employeeId_startDate_endDate_idx" ON "placements"("employeeId", "startDate", "endDate");
CREATE INDEX "employee_profile_change_requests_employeeId_status_idx" ON "employee_profile_change_requests"("employeeId", "status");
CREATE INDEX "employee_profile_change_requests_status_requestedAt_idx" ON "employee_profile_change_requests"("status", "requestedAt");
CREATE INDEX "attendance_reviews_attendanceId_reviewedAt_idx" ON "attendance_reviews"("attendanceId", "reviewedAt");
CREATE UNIQUE INDEX "absence_cases_employeeId_date_key" ON "absence_cases"("employeeId", "date");
CREATE INDEX "absence_cases_status_date_idx" ON "absence_cases"("status", "date");
CREATE UNIQUE INDEX "leave_approvals_leaveRequestId_stage_key" ON "leave_approvals"("leaveRequestId", "stage");
CREATE INDEX "leave_approvals_stage_decidedAt_idx" ON "leave_approvals"("stage", "decidedAt");
CREATE UNIQUE INDEX "leave_balances_employeeId_year_key" ON "leave_balances"("employeeId", "year");
CREATE INDEX "leave_balances_year_idx" ON "leave_balances"("year");
CREATE INDEX "leave_balance_transactions_leaveBalanceId_createdAt_idx" ON "leave_balance_transactions"("leaveBalanceId", "createdAt");
CREATE INDEX "leave_balance_transactions_leaveRequestId_idx" ON "leave_balance_transactions"("leaveRequestId");
CREATE INDEX "overtime_requests_employeeId_status_date_idx" ON "overtime_requests"("employeeId", "status", "date");
CREATE INDEX "temporary_assignments_employeeId_status_startDate_endDate_idx" ON "temporary_assignments"("employeeId", "status", "startDate", "endDate");
CREATE INDEX "temporary_assignments_locationId_startDate_endDate_idx" ON "temporary_assignments"("locationId", "startDate", "endDate");
CREATE UNIQUE INDEX "payroll_cycle_settings_clientId_key" ON "payroll_cycle_settings"("clientId");
CREATE UNIQUE INDEX "payroll_cycle_settings_locationId_key" ON "payroll_cycle_settings"("locationId");
CREATE UNIQUE INDEX "payroll_periods_cycleSettingId_periodStart_periodEnd_key" ON "payroll_periods"("cycleSettingId", "periodStart", "periodEnd");
CREATE INDEX "payroll_periods_cycleSettingId_status_periodStart_idx" ON "payroll_periods"("cycleSettingId", "status", "periodStart");
CREATE UNIQUE INDEX "payroll_runs_payrollPeriodId_key" ON "payroll_runs"("payrollPeriodId");
CREATE UNIQUE INDEX "payroll_revisions_payrollRunId_revisionNumber_key" ON "payroll_revisions"("payrollRunId", "revisionNumber");
CREATE INDEX "payroll_revisions_payrollRunId_status_idx" ON "payroll_revisions"("payrollRunId", "status");
CREATE INDEX "payroll_revision_items_payrollRevisionId_idx" ON "payroll_revision_items"("payrollRevisionId");
CREATE INDEX "payroll_revision_items_payrollSlipId_idx" ON "payroll_revision_items"("payrollSlipId");

-- AddForeignKey
ALTER TABLE "employee_profile_change_requests" ADD CONSTRAINT "employee_profile_change_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_reviews" ADD CONSTRAINT "attendance_reviews_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "absence_cases" ADD CONSTRAINT "absence_cases_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_balance_transactions" ADD CONSTRAINT "leave_balance_transactions_leaveBalanceId_fkey" FOREIGN KEY ("leaveBalanceId") REFERENCES "leave_balances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_balance_transactions" ADD CONSTRAINT "leave_balance_transactions_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "temporary_assignments" ADD CONSTRAINT "temporary_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "temporary_assignments" ADD CONSTRAINT "temporary_assignments_originPlacementId_fkey" FOREIGN KEY ("originPlacementId") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "temporary_assignments" ADD CONSTRAINT "temporary_assignments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "temporary_assignments" ADD CONSTRAINT "temporary_assignments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_cycle_settings" ADD CONSTRAINT "payroll_cycle_settings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_cycle_settings" ADD CONSTRAINT "payroll_cycle_settings_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_cycleSettingId_fkey" FOREIGN KEY ("cycleSettingId") REFERENCES "payroll_cycle_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_revisions" ADD CONSTRAINT "payroll_revisions_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_revision_items" ADD CONSTRAINT "payroll_revision_items_payrollRevisionId_fkey" FOREIGN KEY ("payrollRevisionId") REFERENCES "payroll_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_revision_items" ADD CONSTRAINT "payroll_revision_items_payrollSlipId_fkey" FOREIGN KEY ("payrollSlipId") REFERENCES "payroll_slips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
