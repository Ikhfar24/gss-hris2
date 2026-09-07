ALTER TABLE "attendances"
ADD COLUMN "checkInAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN "checkInGeofenceLatitude" DOUBLE PRECISION,
ADD COLUMN "checkInGeofenceLongitude" DOUBLE PRECISION,
ADD COLUMN "checkInGeofenceRadiusMeters" INTEGER,
ADD COLUMN "checkInLocationName" TEXT,
ADD COLUMN "checkOutAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN "checkOutGeofenceLatitude" DOUBLE PRECISION,
ADD COLUMN "checkOutGeofenceLongitude" DOUBLE PRECISION,
ADD COLUMN "checkOutGeofenceRadiusMeters" INTEGER,
ADD COLUMN "checkOutLocationName" TEXT;
