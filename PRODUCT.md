# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Papaiz HRIS serves two primary operating scenes within one product:

- Employees and coordinators completing daily work from mobile devices, including attendance, requests, history, profile, and team workflows.
- HR, Finance, Directors, Commissioners, and System Administrators managing workforce operations from desktop workspaces.

## Product Purpose

Papaiz HRIS connects employees, client sites, placements, schedules, attendance, requests, payroll, and approvals in one role-aware operational system. Success means each user can understand current state, complete authorized work quickly, and trust that recorded decisions follow the established workflow.

## Positioning

Papaiz is a workforce operations map: people, client locations, placements, temporary assignments, attendance evidence, and governed decisions remain visibly connected instead of appearing as unrelated administrative modules.

## Operating Context

- Employees use mobile-first self-service during the workday.
- Coordinators monitor scoped teams and complete authorized reviews.
- HR and administrative users work with compact operational data on desktop.
- Finance manages payroll cycles, runs, payments, and revisions.
- Directors handle defined approval stages and organization monitoring.
- Client locations, geofence evidence, work schedules, and employment types shape daily operations.

## Capabilities and Constraints

- Preserve all existing backend APIs, request and response meanings, database schema, routes, roles, permissions, validation, and workflow semantics.
- Preserve payroll and attendance calculations, geofence rules, lifecycle rules, placement rules, temporary-assignment rules, and leave, overtime, and resignation behavior.
- Use only data already available from existing contracts.
- Navigation presentation and page composition may change, but route destinations and role visibility remain authoritative.
- Desktop defaults to compact operational density with readable 40 to 44px rows, grouped actions, nearby filters, and contextual detail surfaces.
- Mobile is a purpose-built employee and coordinator experience, not a reduced desktop layout.

## Brand Commitments

- Product name: Papaiz HRIS.
- Primary navy: `#0F3151`.
- Teal accent: `#01ACAC`.
- Danger crimson: `#DC143C`.
- White: `#FFFFFF`.
- Secondary indigo: `#29297A`.
- Application background: `#F0F0F0`.
- Primary text: `#1B1513`.
- Border neutral: `#E2DFD9`.
- Success sage: `#B6D588`.
- Navy is dominant, teal is restrained and premium, crimson is destructive or critical, and sage communicates success.
- The product must feel premium, professional, modern, clean, distinctive, enterprise-ready, mobile-first for employee workflows, and desktop-optimized for administrative workflows.

## Evidence on Hand

- Existing frontend routes, components, role navigation, and workflow presentations under `frontend/`.
- Existing backend contracts and source-sensitive regression tests under `backend/test/`.
- Existing product requirements and functional revisions in repository documentation.
- No new commercial claims, business metrics, or unsupported workflow data may be fabricated.

## Product Principles

1. Show the relationship between people, places, time, and decisions.
2. Adapt the interaction model to the user’s operating scene while retaining one recognizable product identity.
3. Keep current state, scope, and the next authorized action immediately legible.
4. Make dense administration efficient without making employee self-service feel administrative.
5. Treat backend authority and auditability as product behavior, not visual decoration.

## Accessibility & Inclusion

- Support keyboard operation, visible focus, semantic forms and tables, textual status labels, reduced motion, and WCAG AA contrast.
- Design for employees and administrative users with varied technical confidence.
- Verify responsive behavior at 360, 375, 390, 412, 430, 768, 1024, 1280, and 1440px or wider.
- Prevent unintended horizontal overflow, clipped actions, vertically collapsed labels, and bottom-navigation collisions.
