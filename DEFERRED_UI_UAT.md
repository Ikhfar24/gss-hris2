# Deferred UI UAT / Final Polish

Consolidated browser and visual review is intentionally scheduled after UI Phase 5.

## Phase 2 Employee Reference

- Compare card density and vertical spacing at 360 px, 390 px, and 430 px on physical devices.
- Confirm preferred icon emphasis and wording for Employee quick services.
- Review compact map height and marker/circle colors in varied outdoor GPS conditions.
- Review shadow and radius intensity across Home, Profile, and attendance evidence cards.
- Confirm long Indonesian Employee names, job titles, and placement names wrap as preferred.
- Consider lazy map expansion in historical detail to reduce OpenStreetMap tile requests.

These items are cosmetic or preference-based. Crashes, broken navigation, authorization, attendance integrity, hydration, API contracts, and build failures are not deferred.

## Phase 3 Coordinator and Admin HR

- Compare density of team/workforce metric cards on 360 px and 390 px physical devices.
- Review whether the one-scope `Tim Saya` title needs shorter wording on small screens.
- Confirm preferred ordering of HR action-center cards after real production usage.
- Review desktop width and grouping of long ADMIN_HR master-data forms.
- Review map height in the attendance review dialog on tablet landscape.
- Confirm preferred visual weight for destructive lifecycle actions in Profil Lengkap.

## Phase 4 Finance, Marketing, Executive, and System Admin

- Compare payroll Employee-card density at 360 px, 390 px, and 430 px on physical devices.
- Review grouping and visual weight of Finance payroll lifecycle controls on wide desktop.
- Confirm preferred executive metric ordering after Director and Commissioner field use.
- Review wording of read-only Commissioner monitoring states.
- Compare System Admin module-card density on tablet portrait and landscape.
- Review icon choices for Coordinator Scope and device administration.
- Confirm whether Finance activity labels should use “Finance” or “Keuangan” consistently.
- Payslip Request remains deferred until the real company workflow, evidence, delivery, and notification policy are known. No backend model or state machine was added.
- Optional Director/Commissioner attendance remains deferred. Current `attendanceRequired=false` continues to mean attendance is unavailable.

## Phase 5 Shared Integration

- Compare compact action-dialog widths and textarea heights on 360 px and 390 px physical devices.
- Confirm preferred mobile card density for leave, overtime, and temporary-assignment histories with long names and reasons.
- Review whether approval notes should be visually stronger than request reasons after real HR and Coordinator use.
- Compare desktop table minimum widths on small tablets and confirm the preferred horizontal-scroll affordance.
- Confirm Indonesian wording for retry, unavailable, cancellation, and intervention states with business users.
- Review whether Commissioner report downloads should remain visible as read-only exports or be presented only through executive summary cards.

## Consolidated Mobile UAT Revision

- Confirm camera framing and full-screen capture height on representative Android and iOS devices after browser permission prompts.
- Compare geofence map readability outdoors at approximately 5-20 meter GPS accuracy and verify the preferred poor-accuracy warning threshold.
- Confirm compact people-row density with real long names, job titles, and work-location addresses at 360 px and 390 px.
- Validate safe-area clearance on devices with gesture navigation and display cutouts.
- Review the preferred wording for `ON_LEAVE`, missing checkout, and ADMIN_HR self-review audit labels with business users.
