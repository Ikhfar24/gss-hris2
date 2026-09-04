-- Batch 6 is additive. Payroll totals remain on the immutable finalized run;
-- payment records are an independent disbursement ledger.
CREATE TABLE "payroll_payments" (
  "id" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "reference" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_payments_amount_positive" CHECK ("amount" > 0)
);

CREATE INDEX "payroll_payments_payrollRunId_paidAt_idx" ON "payroll_payments"("payrollRunId", "paidAt");
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_payrollRunId_fkey"
  FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
