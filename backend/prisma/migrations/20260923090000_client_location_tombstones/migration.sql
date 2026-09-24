ALTER TABLE "clients"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deletionReason" TEXT;

ALTER TABLE "locations"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deletionReason" TEXT;

CREATE INDEX "clients_deletedAt_idx" ON "clients"("deletedAt");
CREATE INDEX "locations_deletedAt_idx" ON "locations"("deletedAt");
