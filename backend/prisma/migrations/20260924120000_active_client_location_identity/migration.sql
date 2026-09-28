DROP INDEX "clients_referenceCode_key";
DROP INDEX "locations_referenceCode_key";

CREATE UNIQUE INDEX "clients_active_referenceCode_key"
  ON "clients" ("referenceCode")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "clients_active_name_key"
  ON "clients" (LOWER(BTRIM("name")))
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "locations_active_referenceCode_key"
  ON "locations" ("referenceCode")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "locations_active_name_client_key"
  ON "locations" (LOWER(BTRIM("name")), COALESCE("clientId", ''))
  WHERE "deletedAt" IS NULL;
