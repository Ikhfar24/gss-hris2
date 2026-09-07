# Functional Revision Report

## Scope and Evidence

Batch 9 is a regression/documentation pass. It adds one narrow production fix: payroll run generation now creates the run and its population/slips in a single transaction. It adds no schema changes. `backend/test/batch9.test.js` compiles the backend and uses static metadata plus mocked services to verify the implemented revision invariants below.

## Implemented Functional Revision

- RBAC and data projection: backend role guards protect payroll and HR writes; restricted employee views omit sensitive identity, banking, and compensation fields.
- Attendance and payable days: attendance eligibility is profile-based; payable Borongan days require check-in, a real non-system checkout, and `VALID` or approved-after-review status. Exception, forgotten-checkout, alpha, and temporary-assignment flows preserve history.
- Leave and employment: staged leave/sickness/permission/resignation approvals, medical-evidence validation, workday/balance checks, immutable approval and leave-ledger records, and resignation access/placement closure are implemented.
- Master/history safety: employee/user lifecycle guards, safe deletion checks, deactivation, profile-change review, placement overlap protection, and temporary assignments preserve protected history.
- Payroll: Finance creates, reviews, submits, and records payment; Director finalizes; HR has monitor-only views. Configurable client/location periods, daily/monthly generation, reasoned manual components, final lock, snapshots, and linked revision approval/finalization are implemented.
- Operations: paginated/filterable employee operations, scoped export, validated dry-run/commit import, redacted import audit summaries, protected media access, and dashboard attention cards are implemented.
- Audit: sensitive workflows record actor, role, entity, old/new values where applicable, reason, source, and related IDs. Import auditing stores only a batch summary.

## Modules and Schema

Implemented modules include employees/users, attendance/media, leave/absence/overtime, placement/temporary assignments, payroll/payroll-admin, dashboard, audit-log, and shared domain guards. Existing Prisma models support employee attendance eligibility, review/leave history, payroll periods/runs/slips/revisions, and audit metadata. Batch 9 adds no migration.

## Tests

`npm run test:batch9` compiles the Nest backend then checks deliverable existence, RBAC/projection, payable attendance, final-payroll lock and revision preservation, dashboard-card metadata, protected media authorization, and redacted import auditing.

## Known Limitations

- The suite is static/mock regression coverage, not database-backed HTTP integration or browser UAT coverage.
- Outstanding business decisions are recorded only in `OPEN_QUESTIONS_AFTER_REVISION.md`.

## Functional Freeze Recommendation

IMPLEMENTED and VERIFIED items are technically ready for human Functional Review/UAT. OPEN BUSINESS QUESTION and DEFERRED items are not silently implemented. This report does not declare Business Logic Frozen; that decision follows human UAT acceptance.

## Human UAT Fix Pack 01

Operational role accounts can now retain both an application role and an
Employee identity. Seed/demo data links ADMIN_HR, KOORDINATOR, KEUANGAN, and
MARKETING accounts to attendance-required employees with active placements.
Self attendance is available to any linked attendance-required employee;
Coordinator and HR retain their authorized monitoring views, while Finance and
Marketing remain self-service only. Coordinator team scope continues to use
active `CoordinatorScope` employment-type assignments.

## Human UAT Fix Pack 03

Coordinator self-service overtime is allowed when the account is linked to an
Employee. The request target is always `User.employeeId`; Coordinator team
monitoring scope does not expand or replace that identity, and review authority
remains separate.

Profile Change Request self-service is KARYAWAN-only. Coordinator, Finance, and
Marketing profile changes are managed directly by ADMIN_HR. This does not alter
the mandatory attendance policy for linked employees.

## Human UAT Fix Pack 04

ADMIN_HR and SYSTEM_ADMIN retain direct Employee master-data administration via
the audited Employee update workflow. KARYAWAN continues to use Profile Change
Request self-service, while Coordinator, Finance, and Marketing profiles are
maintained directly by HR. Employee master editing does not grant payroll run,
payment, or finalized financial-record authority.

Generic report PDF generation now uses the PDFKit CommonJS runtime correctly.
All report files continue to be generated from backend-authorized projections;
Coordinator queries remain limited by active CoordinatorScope assignments.

Company Settings read and write access is SYSTEM_ADMIN-only at the backend,
navigation, and page level.

## Human UAT Fix Pack 05

Employee master editing now uses an in-application form with prefilled HR-owned
fields, explicit validation/result feedback, and the existing audited Employee
update endpoint. User-facing Employee 360 terminology is now `Profil Lengkap`;
internal API routes and service terminology remain unchanged.

Profile photos extend the existing protected local media architecture. ADMIN_HR
alone can upload or replace validated JPEG, PNG, or WebP images up to 5 MB.
Employee records store only a protected media URL, retrieval verifies the
current Employee reference and existing Employee/CoordinatorScope visibility,
and audit metadata records only upload/replace state without storage paths or
image bytes. Replaced physical files are not automatically deleted because no
safe media-retention/cleanup policy currently exists; stale URLs are unusable
because retrieval requires the current Employee photo reference.

## Human UAT Fix Pack 06

The Attendance page now uses Leaflet with OpenStreetMap to show the assigned
work point, configured geofence, current device point, reported GPS accuracy,
and live distance/range state. `watchPosition` exists only for the mounted
Attendance self-service page and is cleared on navigation, unmount, or terminal
location error; no movement stream is persisted or tracked in the background.
The live fix is informational: each submission requests a fresh position and
does not reuse a stale map coordinate after a location failure.

Check-in and check-out continue to be authorized and recalculated by the
backend. Each event now stores nullable device accuracy plus a snapshot of the
location name, geofence center, and radius used for that event. This preserves
historical evidence if Location master data changes. Existing records remain
unchanged and explicitly show `Lokasi historis tidak tersedia` when no snapshot
exists.

Linked employees can view their own attendance history and evidence details.
ADMIN_HR, SYSTEM_ADMIN, and DIREKTUR can view organization-authorized detail;
KOORDINATOR detail uses active CoordinatorScope. Other operational roles remain
self-only. Attendance selfies continue through protected media authorization.

The business has not approved a GPS accuracy rejection threshold. Accuracy is
therefore retained and displayed for evidence without creating an arbitrary
new hard gate; server-side configured-radius validation remains authoritative.

OpenStreetMap map tiles are requested directly from the public tile service,
which receives normal web-request metadata such as the requester IP and tile
coordinates. A self-hosted tile service or privacy proxy remains an operational
deployment choice if policy prohibits direct third-party tile requests.
