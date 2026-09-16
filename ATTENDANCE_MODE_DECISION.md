# Attendance Mode Phase 1 Decision

## Phase 1 Decision

`attendanceRequired` remains the existing eligibility switch: `false` means the
Employee cannot record attendance. `attendanceMode` only controls how an
eligible Employee records it and is configured directly on `Employee`, never
inferred or synchronized from `User.role`.

Optional attendance for Director or Commissioner is not implemented in Phase 1.

## Future Options

### A. Add `attendanceAllowed`

Keep `attendanceRequired` unchanged and add an independent Boolean. Existing
rows can safely default `attendanceAllowed` to the current
`attendanceRequired` value. This is minimally disruptive, but the two booleans
permit invalid combinations unless every write path enforces a state matrix.

### B. Add `attendancePolicy`

Add a richer enum such as `REQUIRED`, `OPTIONAL`, and `INELIGIBLE`, while
temporarily retaining `attendanceRequired` for existing consumers. This models
the business meaning clearly, but requires an approved mapping, a transition
period, and eventual retirement rules for the old Boolean.

### C. Add `optionalAttendanceAllowed`

Keep `attendanceRequired` authoritative and add a narrowly scoped opt-in flag.
`attendanceRequired=true` remains mandatory, while
`attendanceRequired=false` plus `optionalAttendanceAllowed=true` permits a
voluntary record without Alpha or reminders. This is backward-compatible and
small, but encodes policy through a less expressive combination of fields.

## Recommendation For Later Approval

Option B is the clearest long-term model. Option C is the smallest safe bridge
if optional attendance is needed before a broader policy migration. No option
will be implemented until its data mapping, absence behavior, reporting, and
administration workflow receive explicit approval.
