-- Batch 3 adds lifecycle/audit metadata without changing or deleting legacy rows.
ALTER TYPE "EmployeeStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';

ALTER TABLE "audit_logs"
  ADD COLUMN "actorRole" "Role",
  ADD COLUMN "source" TEXT,
  ADD COLUMN "relatedEntityId" TEXT;

CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");
