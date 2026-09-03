# Open Questions After Functional Revision

## Leave Balance Calculation

The specification requires approved annual leave to consume a balance but does
not define whether consumption uses calendar days, scheduled workdays, or a
client/location-specific rule. It also does not define entitlement source,
carry-over, or expiry. Batch 2 therefore adds a balance and immutable
transaction ledger without creating entitlement rows or debiting historical
leave. The approval workflow batch must apply the confirmed policy.
