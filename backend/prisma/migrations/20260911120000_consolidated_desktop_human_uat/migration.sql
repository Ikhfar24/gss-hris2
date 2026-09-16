-- Human-operational import references.
ALTER TABLE "clients" ADD COLUMN "referenceCode" TEXT;
UPDATE "clients" SET "referenceCode" = 'CL-' || UPPER(SUBSTRING(REPLACE("id", '-', '') FROM 1 FOR 8));
ALTER TABLE "clients" ALTER COLUMN "referenceCode" SET NOT NULL;
CREATE UNIQUE INDEX "clients_referenceCode_key" ON "clients"("referenceCode");

ALTER TABLE "locations" ADD COLUMN "referenceCode" TEXT;
UPDATE "locations" SET "referenceCode" = 'LOC-' || UPPER(SUBSTRING(REPLACE("id", '-', '') FROM 1 FOR 8));
ALTER TABLE "locations" ALTER COLUMN "referenceCode" SET NOT NULL;
CREATE UNIQUE INDEX "locations_referenceCode_key" ON "locations"("referenceCode");

-- Temporary credentials remain separate from one-way authentication hashes.
ALTER TABLE "users"
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "user_temporary_credentials" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "ciphertext" BYTEA NOT NULL,
  "iv" BYTEA NOT NULL,
  "authTag" BYTEA NOT NULL,
  "keyVersion" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastRevealedAt" TIMESTAMP(3),
  "revealCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "user_temporary_credentials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_temporary_credentials_userId_key" ON "user_temporary_credentials"("userId");
ALTER TABLE "user_temporary_credentials" ADD CONSTRAINT "user_temporary_credentials_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Force Delete is an audited Employee tombstone so protected history keeps its FK anchor.
ALTER TABLE "employees"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deletionReason" TEXT;
CREATE INDEX "employees_deletedAt_idx" ON "employees"("deletedAt");

-- Device binding is retired. GPS, geofence, selfie, timestamp and review evidence remain.
DROP TABLE IF EXISTS "employee_devices";
ALTER TABLE "attendances"
  DROP COLUMN IF EXISTS "checkInDeviceInfo",
  DROP COLUMN IF EXISTS "checkInDeviceId",
  DROP COLUMN IF EXISTS "checkOutDeviceInfo",
  DROP COLUMN IF EXISTS "checkOutDeviceId";
