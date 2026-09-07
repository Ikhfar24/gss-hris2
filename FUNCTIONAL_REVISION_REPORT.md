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
