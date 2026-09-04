-- Batch 4 preserves existing attendance rows while marking system-detected
-- forgotten check-outs explicitly.
ALTER TABLE "attendances"
  ADD COLUMN IF NOT EXISTS "forgottenCheckout" BOOLEAN NOT NULL DEFAULT false;
