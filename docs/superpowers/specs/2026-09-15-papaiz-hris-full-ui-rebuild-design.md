# Papaiz HRIS Full UI/UX Rebuild Design

## Status

Approved in chat on 2026-09-15 for specification. Implementation requires a separate approval of this written document.

## Objective

Replace the entire Papaiz HRIS frontend experience with a visibly new, premium enterprise product while preserving all functional behavior. The rebuild may replace presentation architecture, layouts, navigation presentation, responsive patterns, and shared UI components. It must not alter the application brain: routes, APIs, payload meanings, permissions, validation, calculations, geofence rules, lifecycle rules, or workflow semantics.

## Product Model

Papaiz is a dual-mode workforce operations system.

- Employee and Coordinator workflows are purpose-built for mobile work during the day.
- HR, Finance, Director, Commissioner, and System Admin workflows are optimized for compact desktop operations.
- The distinguishing mechanism is the connected workforce operations map: people, client locations, placements, schedules, attendance evidence, requests, payroll, and governed decisions remain visibly related.

`PRODUCT.md` is the durable authority for product truth and constraints.

This specification supersedes the presentation and structural restrictions in `docs/UI_DESIGN_SYSTEM.md`, including its deferred structural recommendations. That earlier document remains historical evidence for semantic behavior and accessibility, but it is not visual authority for this rebuild.

## Direction: Site Dossier

Papaiz will use a digital operations-folio language derived from site files, attendance registers, assignment sheets, and approval records. It must feel precise and contemporary, not nostalgic or skeuomorphic.

### Thesis

The interface is a living dossier of people, places, time, and decisions. It refuses the category-default composition of a generic sidebar beside interchangeable rounded cards.

### Visual World

- Navy forms the persistent binder structure, selected headers, and primary controls.
- White is the working sheet.
- The neutral background is the desk or canvas beneath sheets.
- Gold appears as narrow indexes, active markers, and rare priority accents.
- Sage communicates approved, active, complete, and present states.
- Indigo communicates information and in-progress context.
- Crimson is limited to destructive, rejected, invalid, and critical states.
- Thin rules, aligned fields, offset indexes, clipped metadata blocks, and status stamps create the dossier character.
- Gradients, glass effects, decorative illustrations, generic icon-tile grids, and uniform card walls are excluded.

### Typography

Archivo Variable is the product typeface. Its proportions support Indonesian labels, compact enterprise tables, and mobile readability while giving Papaiz a more operational character than a generic SaaS sans.

- Page titles: 24–30px, weight 650–700.
- Section titles: 17–20px, weight 650–700.
- Body: 14–16px, weight 400–500.
- Labels: 12–14px, weight 600.
- Comparative numbers, dates, time, and money use tabular figures.
- Uppercase is reserved for genuine categories, indexes, and compact metadata.

### Shape And Elevation

- Work sheets: 8–12px corners.
- Mobile task panels and dialogs: 16px corners.
- Compact controls: 8px corners.
- Status stamps and avatars may be pill-shaped or circular.
- Hierarchy comes primarily from color fields, rules, spacing, and layering.
- Shadows are reserved for overlays, raised mobile sheets, and a selected inspector.

### Motion

- Context sheets and inspectors settle over 140–180ms.
- Motion explains a state or layer change; it does not decorate page load.
- Reduced-motion mode removes translation and preserves immediate state feedback.

## Experience Architecture

### Desktop Shell

Desktop uses four coordinated regions:

1. A 248px navy navigation spine with role-filtered module groups.
2. A compact context bar for current scope, page-level search, notifications, and account access.
3. A flexible work-sheet canvas for the primary task.
4. An optional contextual inspector for selected records, detail, and secondary actions.

The inspector must not introduce new routes or API calls. It presents data already available to the current page or uses the page's existing detail request.

### Mobile Shell

Mobile uses a separate composition rather than scaling down the desktop shell:

- A compact navy context header shows identity, placement, or current operational scope.
- Content follows “today, task, history” ordering where applicable.
- Four role-specific destinations remain in bottom navigation.
- Presensi remains the central capability-gated action when attendance is available.
- Other authorized modules remain accessible through a full-height module sheet.
- Safe-area insets and bottom-navigation clearance are mandatory.

### Navigation Contract

The current route and role matrix in `frontend/lib/navigation.ts` remains authoritative. Labels and grouping may be clarified, but destination paths, capability gates, and role visibility must remain equivalent.

Active navigation must use `aria-current`. Keyboard focus, long labels, and small-screen access must remain visible and operable.

### Page Families

Pages use one of five composition families:

- **Work queue:** approvals, absence cases, leave, overtime, placement requests, and profile changes.
- **Registry:** employees, users, clients, and locations.
- **Operational timeline:** attendance, attendance history, activity, placement history, and temporary assignments.
- **Financial workspace:** payroll and reports.
- **Personal workspace:** dashboard, profile, account, request hub, and payslips.

The families share tokens and primitives but do not force identical page structures.

## Shared Presentation Modules

The rebuild may replace or expand the shared UI layer with these presentation-only modules:

- `DossierPage`: shell-aware page frame and context heading.
- `ContextBar`: scope, search, filters, and page actions.
- `WorkSheet`: primary content plane with optional indexed sections.
- `Inspector`: desktop contextual detail panel.
- `Sheet`: mobile contextual detail or action surface.
- `DataGrid`: compact desktop table with sticky headers and column priorities.
- `ActionMenu`: accessible secondary row actions.
- `MobileRecord`: domain-neutral mobile record shell.
- `FilterRail`: grouped responsive filters and active-filter summary.
- `StatusStamp`: explicit domain status mapped to semantic presentation.
- `MetricStrip`: one lead measure with supporting facts, not equal KPI tiles by default.
- `Timeline`: attendance, placement, lifecycle, approval, or activity events.
- `FormSection`: associated labels, descriptions, field errors, and action footer.
- `StatePanel`: layout-aware loading, empty, error, and unavailable states.

Domain pages remain responsible for fetches, payload construction, permissions, and state transitions. Presentation modules receive values and callbacks and must not infer authority.

## Desktop Interaction Rules

- Registry rows are 40–44px high by default.
- Headers may be sticky within a locally contained data region.
- Columns receive explicit widths and wrapping rules; identity and status may not collapse vertically.
- One primary row action may remain visible. Secondary actions move into an accessible menu.
- Filters stay near the data they affect and collapse into a summary when space is constrained.
- Selecting a row may open the inspector while preserving list position.
- Bulk actions appear only where an existing bulk operation exists.
- Horizontal scrolling is a last resort for genuinely wide financial or evidence tables and remains locally contained.

## Mobile Interaction Rules

- Touch targets are at least 44px.
- Records become stacked cards with explicit identity, state, key metadata, and actions.
- Forms are full width and use mobile-appropriate input types.
- Primary actions remain visible without zooming or horizontal scrolling.
- Long dialogs become full-height sheets with reachable sticky action footers.
- Desktop tables are not rendered as squeezed tables on employee or Coordinator mobile routes.
- Text remains at least 12px for metadata and 14px for normal content.

## Page Designs

### Login

Use an asymmetric sign-in composition: a navy identity field with the dynamic company mark and a white credential sheet. Preserve current credential submission, session bootstrap, redirect, and error behavior.

### Role Dashboards

Use existing data only.

- Employee: current placement, today's attendance state, next primary action, active requests, and recent records.
- Coordinator: scoped team state, attendance exceptions, approvals, and workforce access.
- HR: workforce movement, attendance exceptions, requests, employee operations, and payroll monitoring.
- Finance: payroll lifecycle and payment/revision queues plus personal attendance where currently available.
- Director: pending decisions, organization-level monitoring, and read-only context.
- Commissioner: read-only organization signals with no mutation controls.
- System Admin: account/configuration state and system modules without implied business authority.

Dashboards must not become four identical metric cards followed by generic panels. Each role gets one lead operational fact and the queues that role can act on.

### Attendance And Evidence

- Mobile ordering: current shift and placement, evidence readiness, primary check-in/out action, then map and supporting detail.
- Camera and GPS capture remain one focused full-screen task.
- Existing geofence, location, accuracy, fallback, and evidence behavior remains unchanged.
- Attendance history uses mobile records and a compact desktop timeline/table.
- Monitoring is people-first with grouped filters and an attendance-detail inspector.
- Review and correction use the existing authorized actions and immutable evidence semantics.
- Attendance correction remains inside the existing attendance detail/review surfaces; the rebuild does not add a correction route or workflow.

### Requests

- The request hub becomes a mobile service launcher plus active-request and recent-history sections.
- Leave, permission, sickness, resignation, overtime, cancellation, and profile-change actions preserve all current fields, validations, stages, and owners.
- Work-queue pages show current stage, responsible authority, submitted evidence, and available action without inventing status meanings.

### Employee Directory And Employee 360

- Desktop directory emphasizes avatar, name, employee number, employment type, status, placement, and one primary action.
- Secondary lifecycle and administrative actions use `ActionMenu`.
- Mobile uses employee records rather than a wide table.
- Employee 360 becomes a tabbed dossier with a persistent identity and employment summary.
- Tabs group existing sections only: overview, employment, placement, attendance, leave, documents, and sensitive information where current authorization exposes it.
- Tab presentation must not change fetch scope, redaction, edit authority, or route.

### User Management

- Separate account identity, role/status, employee link, and temporary credential condition into readable columns.
- Prevent role and status labels from wrapping vertically.
- Show one primary management action and place lifecycle, reset, reveal, and safe-delete actions in a labeled menu.
- Preserve every current action, reauthentication requirement, audit reason, and protected-history behavior.
- Coordinator scopes become a dedicated work sheet with current scopes, assignment controls, and revoke actions.
- Mobile uses account records with actions in a sheet.

### Clients, Locations, And Holidays

- Client records emphasize linked sites and contact context.
- Location records emphasize client, work schedule, active state, and geofence configuration.
- Preserve import, coordinate parsing, map selection, radius, schedule, and active-state behavior.
- Holidays remain calendar-led with a linked day agenda and confirmed deletion.

### Placement And Temporary Assignments

- Present origin, destination, effective period, employment type, and approval stage as one movement record.
- Preserve placement history, mutation/reassignment meaning, authority stages, date rules, and temporary-assignment overlap behavior.

### Payroll

- Finance uses a lifecycle workspace: run/period list, selected run sheet, totals, slips, manual items, payments, and revisions.
- Director uses decision dossiers with required detail before approval or rejection.
- HR remains monitor-only.
- Employees see finalized personal slips only.
- Calculations, payable rules, lifecycle locks, payment behavior, revisions, exports, and authority remain untouched.

### Reports

Use a filter-and-output workbench with grouped scope/date/status filters, active-filter summary, and clear export actions. Existing report endpoints, authorization, formats, and columns remain unchanged.

### Profile, Account, Settings, And System

- Personal profile and account use clear identity, work context, contact data, and security sections.
- Settings use grouped branding and company-identity sheets with live success/error feedback.
- System administration is an authority-aware module directory and must not imply Payroll, Director, or HR photo permissions.

## Status And Action Semantics

- Every domain status maps explicitly to a label and semantic tone.
- Color never carries meaning alone.
- Gold indicates focus, indexing, or priority, not generic warning.
- Sage indicates positive completion but uses an accessible dark foreground.
- Crimson is reserved for rejection, invalid state, destructive action, and critical error.
- Approval and destructive actions use busy-safe confirmation and cannot submit twice.

## Data And Behavior Preservation

The rebuild must retain:

- All existing route paths and query-string meanings.
- All existing API endpoints, methods, payload fields, and response interpretations.
- All role and capability checks.
- All validation and required-reason rules.
- All attendance, payroll, leave, overtime, placement, and lifecycle calculations and transitions.
- All media protection and redaction behavior.
- All current import and export behavior.
- All audit-sensitive confirmation and credential flows.

Presentation extraction must not duplicate business logic. Existing page functions may be moved only when their inputs, outputs, and effects remain equivalent and regression tests protect the move.

## Responsive Matrix

Required widths: 360, 375, 390, 412, 430, 768, 1024, 1280, and 1440px or wider.

- 360–430: mobile shell, stacked records, full-width forms, sheets, and bottom navigation.
- 768: tablet composition with reduced columns and no desktop-only assumptions.
- 1024: compact desktop shell and constrained inspector behavior.
- 1280–1440+: full navigation spine, work sheet, and optional inspector.

No target width may introduce unintended page-level horizontal overflow, clipped actions, vertically collapsed labels, inaccessible dialog footers, bottom-navigation collisions, or a blank right-side canvas.

## Accessibility

- Semantic landmarks and one clear page heading.
- Persistent, associated form labels and connected descriptions/errors.
- Keyboard-operable navigation, tabs, menus, dialogs, sheets, tables, and calendars.
- Visible focus on all interactive elements.
- `aria-current`, `aria-expanded`, `aria-selected`, and live regions where appropriate.
- WCAG AA text and control contrast.
- Textual status and validation meaning.
- Reduced-motion support.
- Focus restoration after dialogs, sheets, and menus close.

## Migration Boundaries

The rebuild should be delivered in coherent internal stages while maintaining a buildable application:

1. Replace global tokens, typography, and shared presentation primitives.
2. Replace desktop and mobile shells while retaining navigation filtering.
3. Rebuild personal and employee-mobile workflows.
4. Rebuild attendance and evidence workflows.
5. Rebuild workforce registries and Employee 360.
6. Rebuild request, placement, and approval queues.
7. Rebuild client, location, and holiday master data.
8. Rebuild payroll and reports.
9. Rebuild users, settings, and system administration.
10. Complete cross-role responsive, accessibility, and visual convergence.

The stages are implementation boundaries, not partial product releases. Final completion requires the whole frontend to use the new system.

## Verification Gates

Each stage must preserve source-sensitive contracts and pass relevant tests. Final completion requires:

- `npx tsc --noEmit` in `frontend`.
- Next.js production build with the existing 29-route inventory unless the repository's functional baseline changes independently before implementation.
- Backend production build.
- Complete backend regression suite.
- Role-based navigation tests.
- Mobile overflow and dialog-reachability tests.
- Workflow-specific attendance, employee, request, payroll, user, and authorization tests.
- One final design-detector run over changed UI targets.
- Visual captures at all required widths, with focused verification of Presensi, request flows, Coordinator team views, employee directory, Employee 360, user management, payroll, and sheets/dialogs.
- Final `git diff --check` and worktree audit without reverting unrelated changes.

## Completion Criteria

The rebuild is complete only when:

- Old and new versions are immediately distinguishable side by side.
- Every existing function remains available to the same authorized roles.
- Mobile employee and Coordinator workflows feel purpose-built rather than compressed.
- Desktop administrative work is compact, readable, and action-efficient.
- No page remains visually dependent on the discarded generic card-and-sidebar system.
- Validation gates pass without changing backend behavior to accommodate the redesign.
- The final implemented system is documented in `DESIGN.md` after visual review.
