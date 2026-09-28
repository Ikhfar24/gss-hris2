# Client and Location Management Design

## Scope

Add ADMIN_HR-only Client and Location editing, safe deletion, force deletion, responsive action menus, and immediate pending profile-photo preview. Existing read permissions remain unchanged. No other role may call or see mutation actions.

## Authorization

- Client and Location create, update, import commit, normal delete, and force delete accept only `ADMIN_HR`.
- Controllers use `@Roles(Role.ADMIN_HR)` and services independently assert `actor.role === ADMIN_HR`.
- Read endpoints retain their current roles.
- Non-ADMIN_HR pages render detail-only views and no mutation controls.

## Data Lifecycle

Add nullable `deletedAt`, `deletedById`, and `deletionReason` fields to Client and Location with indexes on `deletedAt`.

Normal deletion is physical and succeeds only when no relations exist. Client blockers are Locations, payroll cycle settings, and temporary assignments. Location blockers are placements, origin/destination placement requests, attendance, holidays, payroll cycle settings, and temporary assignments. Conflicts return an intentional message instead of a database foreign-key error.

Force deletion is an audited tombstone. It sets the record inactive and deleted while preserving historical foreign keys. Client force deletion disables Client-scoped payroll cycle settings. Location force deletion also:

- ends active and scheduled placements;
- cancels pending placement requests involving the Location;
- cancels pending or approved temporary assignments targeting the Location;
- disables Location-scoped payroll cycle settings.

Operational Client and Location queries exclude tombstones. Historical joins continue resolving them. New assignments, imports, payroll scopes, and attendance eligibility cannot select tombstoned records. Names and reference codes are unique among non-tombstoned records but may be reused after force deletion; tombstones remain unchanged under their original identity.

## API

Both resources expose:

- `PATCH /:id` for edit;
- `DELETE /:id` for safe physical deletion with a required reason;
- `DELETE /:id/force-delete` for audited tombstoning with a required reason.

Deletion transactions capture dependency counts and identity snapshots in `CLIENT_DELETE_SAFE`, `CLIENT_FORCE_DELETE`, `LOCATION_DELETE_SAFE`, or `LOCATION_FORCE_DELETE` audit records.

## Frontend

Client and Location edits use controlled shared Dialogs with prefilled fields. Compact DropdownMenu actions expose Detail, Edit, Delete, and Force Delete as applicable. Delete operations use ActionDialog, close before authoritative refresh, and remove successful targets from local state immediately. Responsive cards are used on mobile; desktop tables/cards retain existing presentation without horizontal overflow.

## Profile Photo Preview

The pending `File` remains the upload source. A `blob:` object URL supplies the preview and is revoked whenever the file changes, is cancelled, is saved, or the component unmounts. JPEG, PNG, WebP, non-empty, and 5 MiB validation runs before preview creation while backend validation remains authoritative. Selecting a file never sends a request; upload occurs only when Save is clicked.

## Verification

Backend tests cover role metadata and service-level rejection for every non-ADMIN_HR role, relation blockers, physical pristine deletion, historical tombstoning, cleanup, and operational filtering. Browser UAT covers all requested Client, Location, dialog, role visibility, and photo-preview workflows at desktop widths 1280/1440 and mobile widths 360/375/390/412/430, followed by TypeScript, production builds, focused tests, full regression, and `git diff --check`.
