# Manual Test Checklist

Use separate accounts and representative employee/team/payroll data. Record result and evidence for each scenario.

## Auth

- Login and logout with a valid account; confirm session is HttpOnly-cookie based and no token appears in browser storage.
- Attempt login/use of an inactive account and a stale downgraded role; confirm access is denied.

## Karyawan

- Check in/out within the assigned geofence with selfie evidence; confirm valid attendance.
- Keep the Attendance page open and move or simulate location changes; confirm the map, distance, GPS accuracy, and in/out-of-range label update. Close or navigate away and confirm the location watcher stops.
- Deny location permission and test a device/browser without geolocation; confirm clear denied/unavailable states and the existing declared GPS-failure review path.
- Open own attendance history and inspect check-in/check-out evidence, protected selfies, source, review data, and historical map snapshots. Confirm legacy rows say `Lokasi historis tidak tersedia` rather than showing fabricated coordinates.
- Submit GPS/camera exception with reason; confirm `Perlu Ditinjau` and no payable day until approval.
- Confirm other employees' profile, leave document, attendance, and final slip cannot be accessed.
- Submit leave, sickness with medical document, permission, resignation, and profile-change request; confirm only own records are visible.
- After payroll is final, open and export only own final slip.

## Koordinator

- View only assigned-team attendance and requests; attempt a non-team record and confirm denial.
- Open an assigned employee attendance detail and its historical map; attempt a direct out-of-scope attendance ID and confirm backend denial.
- Submit an overtime request from the linked Employee identity; confirm it targets only the Coordinator's own Employee and retains normal validation.
- Review assigned attendance and leave/permission requests; confirm history and payable status update only for a valid completed checkout.
- Propose a team placement/mutation and export only team-scoped data.
- Confirm the Coordinator can check in/out using their own linked Employee
  placement while team cards exclude employees outside `coordinatorId` scope.
- Confirm `Perubahan Profil` is not shown for Coordinator; authoritative profile changes are managed by HR.

## Admin/HR

- Create, edit, deactivate/reactivate an eligible employee or user; verify reason and audit. Attempt resigned reactivation and protected hard delete; confirm denial.
- Directly edit authoritative Employee master fields such as name, NIP, NIK, contact details, and job profile; confirm no Profile Change Request is fabricated and sensitive raw values are absent from audit data.
- Open the in-app Employee edit dialog, verify current values are prefilled, cancel without mutation, then save and confirm visible success feedback and refreshed data.
- From Profil Lengkap, upload and replace a JPEG/PNG/WebP profile photo up to 5 MB; confirm non-HR roles have no upload control and direct mutation is denied.
- Review profile changes, attendance exceptions, leave/sickness, temporary assignments, absence cases, and HR-stage placement/resignation actions.
- Run employee import as dry-run with invalid/duplicate rows, then commit valid rows; confirm row errors, summary, and no PII/rates in audit data.
- Confirm payroll views are monitoring-only and payroll generation/edit controls are unavailable.

## Keuangan

- Select a client/location period and generate payroll. Verify Borongan pay equals daily rate times only `PAYABLE` attendance; review-pending and system-auto-closed records are excluded.
- Add a manual component with a reason, review, submit, and record payment only after finalization.
- Attempt a line-item change after finalization; confirm denial. Create, submit, Director-approve, and finalize a linked revision; confirm original slip remains unchanged.
- Confirm Finance can check in/out and view only their own employee self-service data, without organization attendance monitoring.
- Confirm Finance can open only their own attendance history/detail and cannot open another employee's detail by direct ID.
- Confirm `Perubahan Profil` self-service is not shown; authoritative profile changes are managed by HR.

## Marketing

- Check personal attendance and view permitted placement/manpower data.
- Confirm employee salary/rates, bank/BPJS data, contracts, payroll, and payroll actions are unavailable.
- Confirm Marketing can check in/out when linked to an attendance-required Employee profile.
- Confirm Marketing can open only their own attendance history/detail and cannot open another employee's detail by direct ID.
- Confirm `Perubahan Profil` self-service is not shown; authoritative profile changes are managed by HR.

## Direktur

- View monitoring and attention queues; approve/reject submitted payroll and applicable Director-stage leave/resignation/mutation.
- Confirm normal employee/user/HR-master edit controls are unavailable.

## Komisaris

- View read-only monitoring data.
- Attempt operational create, edit, approval, payroll, import, and non-permitted export actions; confirm denial or no action control.

## System Admin

- Verify authorized administration and sensitive operational access work and create audit entries.
- Open, read, and update Company Settings; verify every non-System Admin role is denied by both direct URL and API.
- Access protected media for a valid stored record; confirm an unrelated employee is denied and a missing/unlinked filename is not served.

## Cross-Role Regression

- Confirm attention cards show role-appropriate counts, labels, and destinations without sensitive row-level data.
- Confirm sensitive changes preserve original history and capture actor, role, timestamp, reason, and source where applicable.
- Export report PDF as HR and Coordinator; confirm Coordinator output is limited to active CoordinatorScope and report columns exclude payroll, bank, BPJS, and rate data.

## Security

- Attempt cross-user IDs for Employee 360, requests, attendance, payslips, exports, and protected media; confirm backend denial.
- Confirm Coordinator cross-team requests and unauthorized payroll access are denied.
- Confirm Coordinator can load an in-scope Employee profile photo but receives denial for an out-of-scope Employee photo URL or direct ID.
- Confirm exports do not contain bank, BPJS, NIK/NIP, salary/rate, or protected document contents for restricted roles.

## Edge Cases

- Verify forgotten checkout remains distinct from a real checkout and is non-payable until resolved.
- Verify GPS/selfie exception review, Alpha suppression by approved absence, future placement, temporary assignment, and future resignation handling.
- Verify final payroll remains immutable and revision preserves original totals/history.
