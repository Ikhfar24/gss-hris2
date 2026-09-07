# Open Questions After Functional Revision

## Leave Balance Calculation

The specification requires approved annual leave to consume a balance but does
not define whether consumption uses calendar days, scheduled workdays, or a
client/location-specific rule. It also does not define entitlement source,
carry-over, or expiry. Batch 2 therefore adds a balance and immutable
transaction ledger without creating entitlement rows or debiting historical
 leave. The approval workflow batch must apply the confirmed policy.

## Payroll Entitlement at Mid-Period Resignation

The business must define the evidence, owner, and timing for confirming that
client billing/payment entitlement is secured before Finance grants full-period
PKWT salary after a mid-period resignation. The system requires an explicit,
audited decision and does not infer it from the resignation date.

## Biometric Verification Standard

The required face-verification vendor, confidence threshold, fallback evidence,
and retention policy have not been selected. Attendance exceptions remain
explicitly unverified/reviewable rather than claiming a biometric match.

## Import Duplicate Resolution

The policy for a valid incoming row that matches an existing employee, client,
location, contract, or payroll component is unresolved: reject, update selected
fields, or require an explicit merge review. Current import validation avoids
silent duplicate writes.

## Retention of Sensitive Evidence

Retention periods, legal holds, and deletion/anonymization authority for
selfies, sickness documents, payroll evidence, and audit records are not
defined. Protected access is enforced, but retention must follow a confirmed
policy.
