# PAPAIZ HRIS --- Functional Revision Specification

## Revision after Phase 1--6 / Before UI-UX Revamp

> **Instruction for AI Coding Agent**
>
> This is a **functional revision of the existing Papaiz HRIS Phase 1--6
> codebase**, not a new project and not Phase 7.
>
> **Inspect the existing repository first.** Preserve working
> architecture, database relations, audit history, and implemented
> features unless this specification explicitly changes them.
>
> Do **not** merely adapt this specification to whatever the current
> code happens to do. The requirements below are the new source of truth
> for the functional revision. If current behavior conflicts with this
> document, revise the implementation.
>
> You may add new models, fields, migrations, services, endpoints,
> pages, forms, validations, statuses, audit events, imports/exports,
> and tests when required by this specification.
>
> Do **not** perform a major visual redesign yet. UI changes in this
> revision should only be those necessary to expose new/changed
> functionality clearly. A dedicated UI/UX revamp will happen **after
> this functional revision is reviewed and approved**.
>
> Do not silently invent business rules. If a requirement is genuinely
> impossible to implement without a missing business decision, document
> it under `OPEN_QUESTIONS_AFTER_REVISION.md` instead of guessing.

------------------------------------------------------------------------

# 1. Revision Goals

Revise Phase 1--6 so that:

1.  Roles and permissions match the real company workflow.
2.  Employee, staff, user account, contract, placement, attendance,
    leave, resignation, and payroll responsibilities are clearly
    separated.
3.  Missing CRUD/edit/deactivate/reactivate functionality is completed.
4.  Attendance exceptions have explicit review workflows.
5.  Leave, sickness, permission, resignation, mutation, and temporary
    assignment workflows match the approved rules.
6.  Payroll ownership moves primarily to Finance and supports
    client/location-specific payroll periods.
7.  Sensitive changes are auditable.
8.  Bulk import/export and operational search/filtering are usable for
    hundreds of employees.
9.  Existing history is preserved; destructive actions must not corrupt
    relational/audit history.
10. Automated tests cover critical business rules before UI/UX redesign
    begins.

------------------------------------------------------------------------

# 2. Core Domain Principle

Do not treat `KARYAWAN` role as the condition for being an attendance
participant.

Separate these concepts:

-   **User Account** = authentication and authorization.
-   **Role** = system authority.
-   **Employee/Staff Profile** = a person managed by HR and, when
    applicable, required to attend.
-   **Contract** = employment agreement.
-   **Placement** = active work location/client assignment.

A person may have role `ADMIN_HR`, `KEUANGAN`, `MARKETING`, or
`KOORDINATOR` and still have an Employee/Staff Profile because office
staff must attend.

Director and Commissioner are exempt from mandatory attendance.

Keep **one primary role per user** in this revision.

------------------------------------------------------------------------

# 3. Roles and Permissions

## 3.1 Karyawan

May access only their own:

-   Attendance/check-in/check-out.
-   Attendance history.
-   Leave, sickness, permission, and resignation requests.
-   Final payroll slips.
-   Personal profile.
-   Profile change request form.

Employees must **not directly edit authoritative HR data**. They submit
a profile-change request to HR.

A payroll slip becomes visible automatically after the payroll is
`FINAL`; the employee does not request permission each time the slip is
opened.

## 3.2 Koordinator

There are operationally separate coordinators for Borongan and
Arsiparis. A coordinator may only access employees under their
responsibility.

May:

-   Attend for themselves if they have a staff/employee profile.
-   View team attendance.
-   View team leave/sickness/permission.
-   Approve/reject workflows assigned to Coordinator.
-   Propose placement/mutation.
-   Participate in attendance exception review.
-   Export reports only for their own team.
-   View relevant team operational data.

Must not see payroll/salary data unless explicitly required by a future
rule.

## 3.3 Admin / HR / SDM

Primary controller of HR master and operational data.

May:

-   Create/edit/deactivate/reactivate eligible users.
-   Create/edit employee records.
-   Handle employee profile change requests.
-   Manage contracts.
-   Manage placements and mutations.
-   Correct attendance with mandatory reason.
-   Manage leave/permission/sickness/resignation workflows according to
    approval rules.
-   Manage client/location/calendar data where authorized.
-   Import/export HR data.
-   View operational reports.

HR must **not be the primary owner/calculator of payroll**.

HR may prepare and verify payroll source data and salary-related HR
master data, but Finance owns payroll calculation/review.

## 3.4 Keuangan

Finance is the primary payroll operator.

May:

-   Attend for themselves if they have a staff/employee profile.
-   Access payroll working data.
-   Generate/calculate payroll.
-   Edit permitted payroll components.
-   Import payroll/salary component data where supported.
-   Review and verify payroll.
-   View final payroll.
-   Execute/record transfer/payment operationally.
-   Export payroll reports and slips.

Payroll flow is defined in Section 10.

## 3.5 Direktur

Director has global monitoring access.

May:

-   Monitor company-wide HRIS data.
-   Approve workflows specifically assigned to Director.
-   Approve final payroll.
-   Approve Arsiparis resignation.
-   Approve Arsiparis mutation.
-   Propose/initiate a mutation directly.

Director should **not directly edit normal HR master data**. Changes to
authoritative HR data are performed by HR with audit trail.

Director and Commissioner are exempt from attendance.

## 3.6 Komisaris

Read-only monitoring role.

No normal operational edit/approval authority unless explicitly added
later.

## 3.7 Marketing

Marketing is office staff and must be able to attend for themselves.

May also view:

-   Placement information.
-   Manpower information by client/location.

Must not see sensitive payroll/salary data.

## 3.8 System Admin

Technical superuser for system administration, troubleshooting,
configuration, and emergency maintenance.

Maintain comprehensive access where technically necessary, but every
sensitive action must be audited.

------------------------------------------------------------------------

# 4. User Account Management

Add/complete functional User management.

Required actions:

-   Create.
-   Edit.
-   Change primary role without creating a new account.
-   Activate.
-   Deactivate.
-   Reactivate when allowed.
-   Delete only when safe.
-   Forgot/reset password self-service.

Editable account data should include appropriate fields such as:

-   Name.
-   Login email.
-   Role.
-   Active status.
-   Linked employee/staff profile.

Rules:

1.  A resigned user must not simply be reactivated as if resignation
    never occurred. A new valid employment state/process is required
    before access can be restored.
2.  A non-resigned user who was merely deactivated may be reactivated.
3.  Preserve role/status history in audit logs.
4.  If a User/Employee has transactional history, prefer
    deactivate/soft-delete over hard delete.
5.  Hard delete is allowed only for genuinely erroneous/duplicate
    records with no protected transactional history.
6.  Unauthorized actions should be hidden from the UI, not merely
    blocked client-side.
7.  Backend authorization remains mandatory.

------------------------------------------------------------------------

# 5. Employee / Staff Master Data

Required employee/staff data includes, as applicable:

-   NIK.
-   NIP / Employee ID.
-   Full name.
-   Address.
-   WhatsApp / phone.
-   Email.
-   Date of birth.
-   Gender.
-   Bank account.
-   BPJS Kesehatan.
-   BPJS Ketenagakerjaan.
-   Job title.
-   Employment type.
-   Join date.
-   Photo.
-   Digital PKWT/contract scan.

Do **not** require storage of KTP scans in this revision.

The digital employee document scope is primarily:

-   Photo.
-   NIP.
-   Name.
-   Date of birth.
-   Job title.
-   Join date.
-   PKWT/contract scan.

Support existing ID-card photo usage; do not redesign the ID card yet
unless required to store/display the photo.

## 5.1 Employee Editing

Employees cannot directly modify authoritative employee fields.

Add a **Profile Change Request** workflow:

Employee submits requested change -\> HR reviews -\> HR approves/rejects
-\> approved change updates authoritative profile -\> audit trail
records old/new value and actor.

## 5.2 Employee Profile 360

Add or complete an Employee Detail/Profile page containing clear
sections/tabs for:

-   Profile.
-   User account.
-   Contract.
-   Placement.
-   Attendance.
-   Leave / Permission / Sickness.
-   Payroll (only for authorized viewers; employee sees own final
    slips).
-   Documents.
-   History / Audit.

Do not expose salary/payroll sections to unauthorized roles.

------------------------------------------------------------------------

# 6. CRUD, Deactivation, History Protection

For master data such as Client, Location, User, Employee, Contract:

-   Create: supported.
-   Edit: supported where permitted.
-   Deactivate: supported where applicable.
-   Delete: only when safe.

## 6.1 Client and Location

HR/System-authorized users may Create/Edit/Deactivate.

Hard delete is allowed only when the record has never been referenced by
protected historical data.

If a Client or Location has been used by placement, attendance, payroll,
reporting, or another protected historical record:

-   Do not hard delete.
-   Deactivate it instead.
-   Preserve historical reports.

## 6.2 Contract

Authorized HR may edit contract data.

Contract edits must be audited.

A mistakenly created contract may be deleted only when safe and not
historically/transactionally referenced.

## 6.3 Placement

Authorized HR may edit placement when operationally necessary, but
changes must:

-   preserve placement history,
-   be audited,
-   not silently overwrite historical periods,
-   prevent invalid overlapping active placements.

Prefer proper mutation/assignment records for actual movement rather
than rewriting old placement history.

## 6.4 Holiday / Calendar

HR may create/edit/delete calendar information where safe.

If attendance already exists for a date whose calendar classification is
changed, do not corrupt the attendance record.

Changing a day to/from holiday is informational/operational and must not
automatically invent bonuses or extra pay.

------------------------------------------------------------------------

# 7. Attendance Revision

## 7.1 Normal Attendance

Attendance uses:

-   Timestamp.
-   Location/geofence.
-   Selfie/camera evidence.
-   Location work schedule.
-   Tolerance.
-   Check-in/check-out.
-   Validation/review status.

Lateness is calculated automatically from location schedule + configured
tolerance.

Lateness does **not automatically deduct salary**.

## 7.2 Outside Radius

If outside the allowed geofence:

-   Reject normal attendance submission.
-   Do not silently mark present.

Maintain layered anti-fraud mitigation, but **do not claim 100% fake-GPS
prevention in a browser**.

Use available measures such as:

-   Geofence.
-   GPS accuracy checks.
-   Device binding.
-   Mock-location signals when available.
-   Selfie/face verification status.
-   Anomaly flags.
-   Review workflow.

## 7.3 GPS Failure

If the employee is physically at the workplace but GPS fails:

-   Allow exception submission.
-   Mandatory reason.
-   Status becomes `NEEDS_REVIEW`.
-   Employee is expected to contact Coordinator operationally.
-   Coordinator reviews/approves/rejects.
-   HR can monitor/review the case.
-   Audit all decisions.

## 7.4 Camera / Face Verification Failure

If camera or face verification cannot be completed:

-   Attendance exception may still be submitted.
-   Mandatory explanation/evidence state.
-   Status becomes `NEEDS_REVIEW`.
-   Coordinator reviews.
-   HR can monitor/review.
-   Do not pretend face recognition succeeded.

If real face-recognition vendor integration is not present, clearly
represent it as not verified/placeholder rather than a successful
biometric match.

## 7.5 Forgotten Checkout

Do **not** create a fake normal checkout timestamp.

After the expected work end and configured grace/administrative period:

-   Flag `BELUM_CHECKOUT` / equivalent.
-   Notify Coordinator and HR.
-   System may administratively auto-close the record later, but it must
    be explicitly marked `SYSTEM_AUTO_CLOSED` / `NEEDS_REVIEW`, not a
    genuine employee checkout.
-   Coordinator/HR may confirm/correct the record.
-   Correction requires reason.
-   Preserve original data and audit trail.

## 7.6 Attendance Status for Payroll

For Borongan/Harian payroll:

-   `VALID` check-in + check-out -\> counts as one payable attendance
    day.
-   `NEEDS_REVIEW` -\> not yet counted until approved.
-   `APPROVED_AFTER_REVIEW` -\> counts as one payable attendance day.
-   `REJECTED` -\> does not count.
-   Check-in without valid checkout -\> review required before becoming
    payable.

Avoid simplistic logic such as `checkInAt != null => paid day`.

## 7.7 Alpha

When an employee is absent without explanation:

-   Notify Coordinator and HR.
-   They should communicate with the employee.
-   If no valid explanation is recorded within 1x24 hours, mark as
    confirmed Alpha according to workflow.
-   Payroll impact may then be applied according to the employee/payroll
    rule.
-   Any manual adjustment must be auditable.

------------------------------------------------------------------------

# 8. Leave, Sickness, Permission, Overtime, Resignation

## 8.1 Annual Leave

Maintain annual leave balance.

When approved leave is taken, automatically reduce the balance by the
approved number of leave days.

Display:

-   entitlement,
-   used leave,
-   remaining leave,
-   request impact.

Do not hard-code an entitlement number unless already
defined/configurable. Make annual entitlement configurable where
practical.

Approval:

**Employee -\> Coordinator -\> HR -\> Approved**

Director is **not required for normal leave**.

Approved leave for monthly PKWT is an employee right and does **not
increase or reduce the monthly base salary**.

For Borongan/Harian, a non-worked leave day does not create a payable
daily attendance day.

## 8.2 Sickness

Approval:

**Employee -\> Coordinator -\> HR**

Medical certificate/document upload is mandatory for the Sickness
request in the approved current business rule.

For monthly PKWT, approved sickness does not automatically reduce
monthly base salary.

For Borongan/Harian, a day not worked does not create a payable daily
attendance day.

## 8.3 Early Leave / Emergency Permission

Approval primarily by Coordinator.

HR may monitor and request clarification from Coordinator.

Do not require Director.

For monthly PKWT, an approved permission does not automatically change
monthly base salary unless a separate manual payroll adjustment is
explicitly entered.

For Borongan/Harian, payable-day determination still follows valid
attendance/worked-day rules.

## 8.4 Overtime

There is currently **no automatic paid overtime rule**.

Add/maintain an overtime request workflow if needed:

Employee -\> Coordinator/HR review/approval.

Approved overtime is operational evidence only and does **not
automatically generate overtime pay**.

If exceptional payment is required, Finance may enter a manual payroll
component with audit trail.

## 8.5 Resignation --- Borongan

Approval:

**Employee -\> Coordinator -\> HR -\> Approved**

Close employment/placement appropriately while preserving history.

## 8.6 Resignation --- Arsiparis PKWT

Approval:

**Employee -\> Coordinator -\> HR -\> Director -\> Approved**

On final approval:

-   Update employment status appropriately.
-   Record resignation/effective date.
-   Close active placement.
-   Preserve all historical records.
-   Do not delete employee/user history.

------------------------------------------------------------------------

# 9. Placement, Mutation, Temporary Assignment

## 9.1 Borongan Mutation

**Coordinator proposes -\> HR approves -\> placement changes**

## 9.2 Arsiparis Mutation

**Coordinator proposes -\> HR approves -\> Director approves -\>
placement changes**

## 9.3 HR Emergency Mutation

HR may initiate/direct a Borongan mutation when operationally required,
but the system should capture that coordination with the responsible
Coordinator occurred.

Require a reason/coordination note.

Do not implement this as an unaudited silent move.

## 9.4 Director-Initiated Mutation

Director may initiate/propose a mutation directly.

Normal placement history and required downstream processing must still
be preserved.

## 9.5 Temporary Assignment

Add a **Temporary Assignment / Penugasan Sementara** concept separate
from permanent mutation.

It should support:

-   employee,
-   origin placement,
-   temporary client/location,
-   start date,
-   end date,
-   reason,
-   approver/creator,
-   status/history.

At completion, the employee returns to the primary placement without
destroying placement history.

## 9.6 Multiple Locations

Default rule: one employee has one primary active placement at a time.

Do not allow overlapping permanent active placements.

If work at another location is needed, use Temporary Assignment rather
than a second permanent active placement.

Design the data model so a future exception can be supported, but do not
enable uncontrolled multiple primary placements now.

------------------------------------------------------------------------

# 10. Payroll Revision

Payroll is a critical area. Do not simplify these rules.

## 10.1 Payroll Ownership and Workflow

Target flow:

1.  **HR prepares/verifies source HR data.**
2.  **Finance generates/calculates payroll.**
3.  **Finance reviews and edits permitted components.**
4.  HR and Finance may verify source discrepancies operationally.
5.  **Director approves payroll.**
6.  Payroll becomes `FINAL`.
7.  Finance performs/records payment/transfer operationally.
8.  Final slip becomes available to the employee.

HR must not be the primary payroll calculator.

## 10.2 Payroll Period by Client / Location

Payroll periods may differ by Client/Location.

Do not assume one company-wide monthly range.

Provide configurable payroll period/cutoff settings at an appropriate
Client/Location level.

The current operational expectation is that payroll/billing dates can
vary, generally within early-month to approximately the 20th, but **do
not hard-code a universal `3–20` payroll period**. Make the dates
configurable.

Payroll generation must use the selected client/location period.

## 10.3 Monthly PKWT Salary

Monthly PKWT uses the configured monthly/base salary.

Approved:

-   annual leave,
-   sickness,
-   permitted absence

does not automatically increase or reduce monthly base salary.

Lateness also does not automatically deduct salary.

Manual adjustments may be entered by authorized Finance/HR workflow with
mandatory reason/audit.

### Mid-period Start

Current approved rule:

If the PKWT employee starts in the middle of a payroll period, do **not
automatically prorate** the monthly base salary.

Use the full configured monthly salary for the relevant payable period
under the current business rule.

### Mid-period Resignation

If the employee resigns during the period and the corresponding client
billing/payment entitlement for that period has already been
paid/secured, the employee may receive the full salary entitlement.

Because this depends on an operational billing condition, implement this
carefully:

-   Do not guess automatically from resignation date alone.
-   Provide an explicit payroll entitlement/override decision or source
    flag for Finance/HR to confirm whether full-period entitlement
    applies.
-   Record the decision and reason in audit history.

## 10.4 Borongan / Harian

Formula:

**Daily Rate x Number of Valid Payable Attendance Days**

Do not count unapproved Needs Review attendance.

Leave/sickness/permission days where the person did not work do not
create a payable daily attendance day.

## 10.5 Alpha Deduction

After Alpha is confirmed according to the attendance workflow and no
valid explanation exists after 1x24 hours, it may affect payroll.

Do not implement an unsafe unexplained deduction.

The payroll record must expose:

-   confirmed Alpha count,
-   resulting/manual deduction,
-   reason/source,
-   audit history.

Where formula is not explicitly defined, keep the amount
controlled/manual rather than inventing a formula.

## 10.6 Lateness

No automatic salary deduction.

Expose lateness information to HR/Finance.

Any deduction is a manual payroll adjustment with reason and audit.

## 10.7 Overtime

No automatic paid overtime.

Approved overtime does not automatically increase salary.

Exceptional payment may be entered manually by Finance as an additional
payroll component with reason/audit.

## 10.8 Other Payroll Components

Outsourced employees may not have standard meal/transport allowances.

Office roles such as Coordinator, Marketing, Director, Admin/HR, and
Finance may have additional salary components.

BPJS and salary structure may differ by placement/client.

Therefore support flexible payroll components rather than one rigid
universal formula.

At minimum support:

-   Base salary / daily earning.
-   Manual additions.
-   Manual deductions.
-   BPJS-related components.
-   Other configurable/manual components.
-   Notes/reasons.

Support manual entry and bulk import where practical.

## 10.9 Payroll Correction after Final

Final payroll is protected, but mistakes must be correctable through a
controlled process.

Add a correction/revision mechanism with:

-   explicit reason,
-   actor,
-   timestamp,
-   previous value,
-   new value,
-   approval state where appropriate,
-   audit trail.

Do not silently overwrite finalized payroll history.

A correction may create a revision/adjustment record linked to the
original final payroll.

## 10.10 Payroll Snapshot

Preserve the existing good behavior where finalized/historical payroll
retains a snapshot of the salary/rate/components used at that time.

Future edits to Contract/baseSalary/dailyRate must not rewrite
historical payroll.

------------------------------------------------------------------------

# 11. Import / Export

Add robust bulk import for:

-   Employees.
-   Clients.
-   Locations.
-   Contracts.
-   Payroll-related input/components where appropriate.

Use Excel-compatible templates.

Each import should provide:

-   template/downloadable column structure,
-   validation,
-   row-level errors,
-   duplicate handling,
-   preview before commit where practical,
-   summary of inserted/updated/rejected rows.

Do not partially corrupt data because one row is invalid.

Export should be available for authorized operational tables, including:

-   Employee.
-   User where appropriate.
-   Client.
-   Location.
-   Contract.
-   Attendance/reporting.
-   Placement.
-   Leave/permission.
-   Payroll.

Coordinator exports must remain scoped to their own team.

------------------------------------------------------------------------

# 12. Search, Filter, Sort, Pagination, Bulk Actions

For large operational/admin tables, add or complete:

-   Search.
-   Filters.
-   Sorting.
-   Pagination.
-   Appropriate bulk actions.

Employee search/filter examples:

-   Name.
-   NIP.
-   Employment type.
-   Location.
-   Client.
-   Coordinator.
-   Status.
-   Age/date-of-birth where operationally useful.

Search results should surface relevant matches immediately; do not
require the user to manually navigate to the page where the record
happens to reside.

Use a reasonable configurable/default page size such as 25--50 rows
rather than rendering hundreds of rows at once.

Bulk actions may include, where safe:

-   Export.
-   Assign coordinator.
-   Deactivate.
-   Other operational changes.

Do not bulk-perform critical destructive actions without confirmation
and audit.

------------------------------------------------------------------------

# 13. Indonesian Terminology

Operational UI should use clear Bahasa Indonesia.

Examples:

-   `Placement Requests` -\> **Mutasi & Penempatan**
-   `Leave Requests` -\> **Cuti & Izin**
-   `Devices` -\> **Perangkat Absensi**
-   `TENAGA_BORONGAN` -\> **Borongan**
-   `TENAGA_ARSIPARIS` -\> **Arsiparis**
-   `NEEDS_REVIEW` -\> **Perlu Ditinjau**
-   `PENDING_HR` -\> **Menunggu Persetujuan HR**
-   `RESIGNED` -\> **Mengundurkan Diri**

Keep backend enum/code names stable when changing them would cause
unnecessary migration risk; translate them at the UI/API presentation
layer when appropriate.

The users are not technical, so avoid exposing internal enum names.

------------------------------------------------------------------------

# 14. Confirmation, Undo, and Destructive Actions

## 14.1 Confirmation

Do not require confirmation for every harmless action.

Use confirmation for:

-   Deactivation.
-   Safe hard delete.
-   Final payroll.
-   Final resignation approval.
-   Other irreversible/high-impact actions.

Critical actions such as payroll finalization and final resignation
approval should use a stronger/two-step confirmation.

## 14.2 Mandatory Reason

Require reason for sensitive changes including, where applicable:

-   Attendance correction.
-   Payroll correction/manual deduction/manual addition.
-   Contract-sensitive changes.
-   Placement override/emergency mutation.
-   Rejection of critical workflow.
-   Final payroll correction.
-   Other sensitive overrides.

## 14.3 Undo

Do not rely on browser `Ctrl+Z` as the primary data recovery mechanism.

Where a reversible low-risk action benefits from undo, provide an
application-level Undo/Restore mechanism.

Even when undone, preserve the original action and reversal in audit
history where relevant.

------------------------------------------------------------------------

# 15. Audit Trail

Auditability is mandatory for sensitive HR operations.

For important changes record, where applicable:

-   Actor/user.
-   Role.
-   Timestamp.
-   Entity.
-   Action.
-   Previous value/state.
-   New value/state.
-   Reason.
-   Related approval/request ID.
-   Source/system/manual context.

Priority audit areas:

-   User role/status.
-   Employee master changes.
-   Profile change approval.
-   Contract.
-   Placement/mutation/temporary assignment.
-   Attendance exception/correction.
-   Leave/sickness/permission/resignation.
-   Payroll generation/edit/finalization/correction.
-   System Admin sensitive actions.

Do not erase audit history when records are deactivated.

------------------------------------------------------------------------

# 16. Notifications / Operational Attention

At minimum expose in-app notices/queues for:

-   GPS failure attendance.
-   Camera/face verification failure.
-   Forgotten checkout / system auto-close.
-   Alpha.
-   Pending leave/permission/sickness.
-   Pending resignation.
-   Pending mutation.
-   Payroll waiting for review/approval.
-   Employee profile change request.

External WhatsApp/email notification integration is not required unless
already available and stable. Do not invent an external messaging
dependency merely to satisfy the word "notify".

------------------------------------------------------------------------

# 17. Automated Tests Required

Add automated tests for critical backend business logic.

At minimum cover:

## RBAC

-   Employee cannot access another employee's data.
-   Coordinator is scoped to own team.
-   Coordinator export is scoped.
-   Marketing cannot access salary/payroll.
-   Finance payroll permissions.
-   HR restrictions on payroll ownership.
-   Director monitoring/approval vs edit restrictions.
-   Commissioner read-only.
-   Backend denies unauthorized requests even if UI is bypassed.

## Attendance

-   Normal valid attendance.
-   Outside geofence rejection.
-   GPS failure -\> Needs Review.
-   Camera failure -\> Needs Review.
-   Needs Review approval/rejection.
-   Forgotten checkout -\> flagged/auto-closed, not fake normal
    checkout.
-   Attendance payable-day calculation.
-   Alpha workflow.

## Placement

-   Borongan approval flow.
-   Arsiparis approval flow with Director.
-   No overlapping primary placement.
-   Temporary assignment preserves primary placement.
-   Resignation closes active placement appropriately.

## Leave / Resignation

-   Leave Coordinator -\> HR.
-   Sickness Coordinator -\> HR.
-   Early/emergency permission Coordinator workflow.
-   Borongan resignation Coordinator -\> HR.
-   Arsiparis resignation Coordinator -\> HR -\> Director.
-   Leave balance deduction after approval.

## Payroll

-   PKWT monthly full salary behavior.
-   Approved PKWT leave/sickness does not automatically reduce base
    salary.
-   Borongan daily-rate x approved payable attendance days.
-   Needs Review attendance excluded until approved.
-   Lateness does not auto-deduct.
-   Final payroll visibility.
-   Finance ownership/permissions.
-   Director final approval.
-   Historical snapshot immutability.
-   Correction/revision preserves original final history.
-   Client/location-specific payroll periods.

## CRUD / History Safety

-   Cannot hard delete referenced Client/Location/User/Employee where
    protected.
-   Deactivation preserves history.
-   Safe duplicate/unreferenced deletion works.
-   Audit log records sensitive changes.

------------------------------------------------------------------------

# 18. Database Migration Safety

When schema changes are necessary:

1.  Create proper Prisma migrations.
2.  Preserve existing Phase 1--6 data where possible.
3.  Avoid destructive resets as the normal migration path.
4.  Seed/demo data may be updated to demonstrate new workflows.
5.  Add indexes/constraints needed for:
    -   NIP/NIK lookup where appropriate,
    -   active placement uniqueness/overlap protection,
    -   payroll period lookup,
    -   coordinator/team queries,
    -   audit queries.

If an existing enum/model must change, migrate it safely rather than
deleting historical data.

------------------------------------------------------------------------

# 19. UI Scope for This Revision

**Do not perform the dedicated UI/UX redesign yet.**

Allowed UI work:

-   Add missing Edit/Create/Deactivate/Delete-safe actions.
-   Add required forms.
-   Add Employee Profile 360.
-   Add new workflow pages/controls.
-   Add search/filter/sort/pagination.
-   Add import/export controls.
-   Translate operational labels into Indonesian.
-   Hide unauthorized actions.
-   Add confirmation/reason dialogs.
-   Add functional notification/review queues.

Do not spend this revision on:

-   major visual identity overhaul,
-   animation polish,
-   final responsive redesign,
-   decorative dashboard redesign,
-   final mobile navigation redesign,
-   aesthetic component replacement merely for appearance.

Functional correctness first.

------------------------------------------------------------------------

# 20. Required Deliverables from the Coding Agent

After implementation, provide:

1.  Updated source code.
2.  Prisma migrations.
3.  Updated seed/demo data if necessary.
4.  Automated tests.
5.  `FUNCTIONAL_REVISION_REPORT.md` containing:
    -   every requirement implemented,
    -   files/modules changed,
    -   schema changes,
    -   permission changes,
    -   new workflows,
    -   tests added,
    -   known limitations.
6.  `OPEN_QUESTIONS_AFTER_REVISION.md` containing only genuinely
    unresolved business decisions.
7.  `MANUAL_TEST_CHECKLIST.md` with step-by-step UAT scenarios for each
    role:
    -   Karyawan,
    -   Koordinator,
    -   Admin/HR,
    -   Keuangan,
    -   Marketing,
    -   Direktur,
    -   Komisaris,
    -   System Admin.
8.  Update README to reflect actual Phase 1--6 + Functional Revision
    behavior.

------------------------------------------------------------------------

# 21. Definition of Done

This revision is complete only when:

-   Existing Phase 1--6 features still work unless intentionally changed
    by this specification.
-   New business rules above are implemented.
-   Role permissions are enforced in backend and reflected in frontend.
-   Critical CRUD/edit/deactivate/reactivate flows exist.
-   History-safe deletion rules work.
-   Attendance review workflow works.
-   Temporary Assignment works.
-   Leave balance works.
-   Correct approval chains work.
-   Finance-centered payroll workflow works.
-   Client/location-specific payroll period works.
-   Payroll correction/audit works.
-   Bulk import/export works for specified areas.
-   Search/filter/sort/pagination works for admin-scale data.
-   Audit trail covers critical changes.
-   Critical automated tests pass.
-   Build passes.
-   Database migration succeeds without requiring a destructive reset in
    the normal path.
-   Functional Revision Report and Manual Test Checklist are delivered.

------------------------------------------------------------------------

# 22. Final Instruction to Agent

Before editing code:

1.  Inspect the complete existing Phase 1--6 repository.
2.  Map each requirement in this document to the current implementation.
3.  Identify what already exists, what must be modified, and what must
    be added.
4.  Then implement the revision incrementally.
5.  Preserve working features and historical integrity.
6.  Do not substitute current behavior for the requirements in this
    document.
7.  Do not invent missing business rules.
8.  Do not start the dedicated UI/UX redesign.

After implementation, run available builds, migrations, linting, and
automated tests and report the actual results.

**After this revision is delivered, the product owner will review the
updated Phase 1--6 functionality again. Only after functional
approval/freeze will the project proceed to the dedicated UI/UX redesign
stage.**
