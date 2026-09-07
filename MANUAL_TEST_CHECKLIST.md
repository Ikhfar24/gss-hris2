# Manual Test Checklist

Use separate accounts and representative employee/team/payroll data. Record result and evidence for each scenario.

## Auth

- Login and logout with a valid account; confirm session is HttpOnly-cookie based and no token appears in browser storage.
- Attempt login/use of an inactive account and a stale downgraded role; confirm access is denied.

## Karyawan

- Check in/out within the assigned geofence with selfie evidence; confirm valid attendance.
- Submit GPS/camera exception with reason; confirm `Perlu Ditinjau` and no payable day until approval.
- Confirm other employees' profile, leave document, attendance, and final slip cannot be accessed.
- Submit leave, sickness with medical document, permission, resignation, and profile-change request; confirm only own records are visible.
- After payroll is final, open and export only own final slip.

## Koordinator

- View only assigned-team attendance and requests; attempt a non-team record and confirm denial.
- Review assigned attendance and leave/permission requests; confirm history and payable status update only for a valid completed checkout.
- Propose a team placement/mutation and export only team-scoped data.

## Admin/HR

- Create, edit, deactivate/reactivate an eligible employee or user; verify reason and audit. Attempt resigned reactivation and protected hard delete; confirm denial.
- Review profile changes, attendance exceptions, leave/sickness, temporary assignments, absence cases, and HR-stage placement/resignation actions.
- Run employee import as dry-run with invalid/duplicate rows, then commit valid rows; confirm row errors, summary, and no PII/rates in audit data.
- Confirm payroll views are monitoring-only and payroll generation/edit controls are unavailable.

## Keuangan

- Select a client/location period and generate payroll. Verify Borongan pay equals daily rate times only `PAYABLE` attendance; review-pending and system-auto-closed records are excluded.
- Add a manual component with a reason, review, submit, and record payment only after finalization.
- Attempt a line-item change after finalization; confirm denial. Create, submit, Director-approve, and finalize a linked revision; confirm original slip remains unchanged.

## Marketing

- Check personal attendance and view permitted placement/manpower data.
- Confirm employee salary/rates, bank/BPJS data, contracts, payroll, and payroll actions are unavailable.

## Direktur

- View monitoring and attention queues; approve/reject submitted payroll and applicable Director-stage leave/resignation/mutation.
- Confirm normal employee/user/HR-master edit controls are unavailable.

## Komisaris

- View read-only monitoring data.
- Attempt operational create, edit, approval, payroll, import, and non-permitted export actions; confirm denial or no action control.

## System Admin

- Verify authorized administration and sensitive operational access work and create audit entries.
- Access protected media for a valid stored record; confirm an unrelated employee is denied and a missing/unlinked filename is not served.

## Cross-Role Regression

- Confirm attention cards show role-appropriate counts, labels, and destinations without sensitive row-level data.
- Confirm sensitive changes preserve original history and capture actor, role, timestamp, reason, and source where applicable.

## Security

- Attempt cross-user IDs for Employee 360, requests, attendance, payslips, exports, and protected media; confirm backend denial.
- Confirm Coordinator cross-team requests and unauthorized payroll access are denied.
- Confirm exports do not contain bank, BPJS, NIK/NIP, salary/rate, or protected document contents for restricted roles.

## Edge Cases

- Verify forgotten checkout remains distinct from a real checkout and is non-payable until resolved.
- Verify GPS/selfie exception review, Alpha suppression by approved absence, future placement, temporary assignment, and future resignation handling.
- Verify final payroll remains immutable and revision preserves original totals/history.
