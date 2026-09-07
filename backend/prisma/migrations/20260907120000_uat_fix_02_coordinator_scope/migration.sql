CREATE TABLE "coordinator_scopes" (
    "id" TEXT NOT NULL,
    "coordinatorUserId" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coordinator_scopes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coordinator_scopes_coordinatorUserId_employmentType_key" ON "coordinator_scopes"("coordinatorUserId", "employmentType");
CREATE INDEX "coordinator_scopes_coordinatorUserId_active_idx" ON "coordinator_scopes"("coordinatorUserId", "active");
ALTER TABLE "coordinator_scopes" ADD CONSTRAINT "coordinator_scopes_coordinatorUserId_fkey" FOREIGN KEY ("coordinatorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
