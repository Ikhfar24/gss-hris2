# Papaiz HRIS Full UI/UX Rebuild Plan

## Delivery Strategy

Implement the approved Site Dossier system in buildable stages. Each stage ends with TypeScript and its source-sensitive regression subset. The final stage runs both production builds, all backend tests, responsive visual inspection, and the design detector.

## Protected Contract Rules

The rebuild must preserve the exact source anchors asserted by `backend/test` in addition to preserving runtime behavior.

- Keep all 26 authenticated `page.tsx` files and the 29-route production inventory.
- Keep `SessionProvider fallback={<AppShellSkeleton />}` and `<AppShell>{children}</AppShell>` source shapes.
- Keep the shell skip link, `id="main-content"`, `mobile-nav-clearance`, attendance-provider wiring, activity-link attribute order, and capability-gated Presensi trigger.
- Keep navigation role arrays, labels, route strings, and source ordering required by UI Phase tests.
- Keep attendance GPS, evidence, queue, map, review, and overlay source anchors.
- Keep employee edit, force-delete, profile-photo, EmployeeAvatar, and Profil Lengkap source anchors.
- Keep payroll function ordering, confirmation provider, Director detail dialog classes, and decision copy.
- Keep ownership expressions in leave, overtime, placement, and temporary assignment pages.
- Keep global mobile width and document-scroll prohibitions.
- Keep exact overflow class sequences in badges, segmented controls, dialogs, feedback, attendance cards, and employee modal.

## Stage 1: Foundation

Files:

- `frontend/package.json`
- `frontend/app/layout.tsx`
- `frontend/app/globals.css`
- `frontend/tailwind.config.ts`
- `frontend/components/ui/*`

Work:

- Install and load Archivo Variable without changing fixed Next/React dependency versions.
- Replace the visual token system with Site Dossier canvas, binder, sheet, index, rule, typography, spacing, shape, and motion tokens.
- Rebuild buttons, fields, cards, badges, dialogs, segmented controls, feedback, metrics, and headers.
- Add presentation-only dossier primitives: page frame, context band, work sheet, metric strip, data region, mobile record, filter rail, inspector/sheet, action menu, tabs, timeline, and form section.
- Retain all protected class and semantic source anchors.

Validation:

- TypeScript.
- UI Phase 1 and mobile overflow/scroll tests.

## Stage 2: Shell And Entry

Files:

- `frontend/components/AppShell.tsx`
- `frontend/components/AppLogo.tsx`
- `frontend/components/employee/EmployeeAvatar.tsx`
- `frontend/app/login/page.tsx`
- global and authenticated loading/error/not-found pages

Work:

- Replace the 288px light sidebar with the approved 248px navy dossier spine.
- Add desktop context bar and indexed navigation groups.
- Rebuild mobile context header, module sheet, bottom navigation, and Presensi trigger.
- Rebuild account access and global attendance sheet presentation without changing wiring.
- Replace login with the asymmetric navy identity field and white credential sheet.

Validation:

- TypeScript and production build.
- UI Phase 1–5 shell/navigation tests.
- Consolidated mobile and global scroll tests.

## Stage 3: Personal And Mobile Workflows

Files:

- profile, full profile, account, activity, request hub
- attendance history/detail components
- overtime and profile-change pages
- employee dashboard

Work:

- Apply mobile “today, task, history” composition.
- Build personal identity dossier and service launcher.
- Rebuild history and request records with shared mobile records and timelines.
- Preserve every existing endpoint, ownership expression, and action implementation.

Validation:

- UI Phase 2, UI Phase 5, UAT Fix 03–06, and mobile overflow tests.

## Stage 4: Attendance

Files:

- `frontend/app/(dashboard)/attendance/page.tsx`
- attendance monitoring/detail/history components
- attendance and location maps

Work:

- Recompose mobile Presensi around shift context, readiness, primary action, then map/evidence detail.
- Rebuild monitoring as a people registry with contextual detail and review sheets.
- Preserve browser hardware, fresh GPS capture, offline queue, evidence fallback, geofence, review, and correction semantics.
- Remove only demonstrably dead presentation code after source-contract verification.

Validation:

- Attendance mode, consolidated mobile, UAT Fix 06, UI Phase 2/3, and full human UAT tests.

## Stage 5: Workforce Registries

Files:

- employees list and Employee 360
- management employee profile
- users
- clients, locations, holidays
- XLSX import panel

Work:

- Introduce compact desktop data regions with stable columns and action menus.
- Introduce purpose-built mobile records.
- Recompose Employee 360 into accessible dossier tabs while preserving route, data, redaction, and actions.
- Separate user accounts and Coordinator scope management into distinct work sheets.
- Preserve all import, map, credential, lifecycle, safe-delete, and force-delete behavior.

Validation:

- UI Phase 3/4, full human UAT, UAT Fix 04/05, mobile overflow, and desktop UAT tests.

## Stage 6: Workflow Queues

Files:

- leave, absence, placement, temporary assignments, approvals

Work:

- Apply the shared work-queue composition.
- Make stage, authority, evidence, and next authorized action explicit.
- Replace dense inline actions with one primary action and contextual menus/sheets where safe.
- Preserve workflow order, ownership, reasons, and confirmation behavior.

Validation:

- Batch 4/5, UI Phase 5, UAT Fix 01/03, consolidated mobile, and full human UAT tests.

## Stage 7: Dashboards And Control Workspaces

Files:

- role dashboard components
- payroll
- reports
- settings
- system

Work:

- Give each role a distinct existing-data composition with one lead operational fact.
- Rebuild Finance payroll into list, selected sheet, and contextual detail regions.
- Rebuild Director payroll approval and HR monitor-only views.
- Rebuild reports as a filter/output workbench.
- Group settings and system modules in the Site Dossier language.

Validation:

- UI Phase 3/4, Batch 6/8/9, UAT Fix 04, consolidated UAT, and full human UAT tests.

## Stage 8: Convergence And Finish

Work:

- Audit every route for discarded visual-system remnants and one-off literal styling.
- Verify keyboard, focus, labels, status text, sheet/dialog restoration, and reduced motion.
- Inspect 360, 375, 390, 412, 430, 768, 1024, 1280, and 1440+ widths.
- Capture representative desktop and mobile views for independent review.
- Run the design detector once after implementation.
- Apply one bounded correction batch and one confirmation capture.
- Write final `DESIGN.md` and `.impeccable/design.json` from the implemented result.

Final validation:

- Frontend standalone TypeScript.
- Frontend production build and route count.
- Backend production build.
- Complete `backend/test/*.test.js` suite.
- Final detector, responsive evidence, `git diff --check`, and worktree audit.

## Change Discipline

- Do not modify backend source, database schema, migrations, APIs, or tests to make the redesign pass.
- Do not revert or clean unrelated worktree changes.
- Preserve source-sensitive literals and syntax where tests require them.
- Prefer shared presentation modules over repeating new page-local Tailwind systems.
- Keep domain state and mutations in their existing page or feature modules unless a move can be proven behaviorally equivalent.
