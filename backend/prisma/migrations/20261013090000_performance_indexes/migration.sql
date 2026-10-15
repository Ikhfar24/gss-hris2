-- Partial index for attendance dashboard "needs attention" queries
CREATE INDEX IF NOT EXISTS "attendances_needs_attention_idx"
ON "attendances" ("date" DESC)
WHERE "validationStatus" = 'NEEDS_REVIEW' OR "forgottenCheckout" = true;

-- Index for attendance validation status queries  
CREATE INDEX IF NOT EXISTS "attendances_validation_status_idx"
ON "attendances" ("validationStatus", "date" DESC)
WHERE "validationStatus" != 'VALID';

-- Preserve actor identity in audit logs even after user deletion
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actorName" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actorEmail" TEXT;
