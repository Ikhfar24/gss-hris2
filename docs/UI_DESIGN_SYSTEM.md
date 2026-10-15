# GSS UI Design System

## Status and scope

This document defines the approved visual foundation for GSS. Phase UI-1
introduces tokens only. It does not change routes, page hierarchy, shell placement,
dashboard section order, workflow sequence, permissions, or business logic.

The interface is an operational enterprise HR product. It should feel calm, mature,
compact, and readable for employees and administrative users aged 20 to 60+.

## Design principles

1. Preserve the approved information architecture. Improve presentation beneath it.
2. Make the current state and primary action obvious before adding decoration.
3. Use dense layouts on desktop without reducing legibility or target size on mobile.
4. Use color semantically and always reinforce status with text.
5. Prefer borders and spacing over heavy shadows or colored containers.
6. Keep motion short, functional, and safe for reduced-motion preferences.
7. Keep backend permissions and validation authoritative.

## Color system

The intended visual balance is approximately 70% white or light neutral, 20% navy,
and 10% accent or semantic color.

### Approved palette

| Role | Value | Usage |
| --- | --- | --- |
| Primary navy | `#0F3151` | Brand, sidebar, primary actions, selected emphasis |
| Teal accent | `#01ACAC` | Small indicators, icons, attention accents |
| Danger crimson | `#DC143C` | Destructive actions, rejection, critical errors |
| White | `#FFFFFF` | Main surfaces, forms, tables |
| Secondary indigo | `#29297A` | Informational emphasis |
| Application background | `#F0F0F0` | App canvas and disabled surfaces |
| Primary text | `#1B1513` | Body copy and high-contrast text |
| Border neutral | `#E2DFD9` | Dividers, outlines, neutral boundaries |
| Success sage | `#B6D588` | Approved, active, complete, present accents |

### Semantic variants

Palette colors are not always safe as text colors. The token system therefore keeps
the approved color as an accent and provides derived foreground, surface, and border
variants for accessible UI states.

| State | Accent | Foreground | Surface | Border |
| --- | --- | --- | --- | --- |
| Success | `#B6D588` | `#365314` | `#F4F8ED` | `#A0C26F` |
| Warning | `#FFD700` | `#6B5700` | `#FFF9D6` | `#E0B900` |
| Danger | `#DC143C` | `#DC143C` | `#FFF0F3` | `#F1A6B5` |
| Information | `#29297A` | `#29297A` | `#F2F2FB` | `#B5B5DC` |

Teal and sage must not be used as normal text on white. Use their semantic foreground
tokens instead. White on navy, indigo, and crimson is reserved for high-emphasis
controls or surfaces where WCAG AA contrast is maintained.

### Tailwind token usage

Prefer semantic utilities over direct palette utilities in new or refactored UI:

```text
bg-background       Application canvas
bg-surface          Primary surface
bg-surface-subtle   Quiet nested surface
text-foreground     Primary text
text-muted          Secondary text
border-border       Neutral border
bg-brand            Primary action or selected surface
text-brand          Brand emphasis on a light surface
bg-accent            Small teal accent only
text-success         Accessible success text
bg-success-accent    Sage accent
bg-success-surface   Quiet success surface
border-success-border
text-warning         Accessible warning text
bg-warning-surface
bg-danger            Destructive action
bg-danger-surface
text-info
bg-info-surface
```

`brand` remains connected to the validated Company Settings primary color through
`--brand-rgb`. Navy remains the GSS default and fixed structural brand reference.

## Typography

The product typeface is Plus Jakarta Sans Variable with system sans-serif fallbacks.

| Token | Size / line height | Intended usage |
| --- | --- | --- |
| `text-page-title` | 24 / 32px, 700 | Page titles |
| `text-section-title` | 18 / 26px, 700 | Major section headings |
| `text-body` | 14 / 22px | Dense operational body text |
| `text-caption` | 12 / 18px | Supporting labels and metadata |

Body copy should normally remain between 14 and 16px. Critical status or action text
must not be smaller than 12px. Use `tabular-nums` for time, counts, money, and other
values that users compare vertically.

Heading tracking should remain between normal and `-0.02em`. Uppercase labels are
reserved for navigation groups and compact operational categories, not decoration.

## Spacing

Tailwind's default 4px spacing scale remains authoritative. Use these relationships:

| Relationship | Preferred spacing |
| --- | --- |
| Icon to label | 8px |
| Label to control | 6 to 8px |
| Related controls | 12px |
| Card content | 16 to 20px |
| Related sections | 20 to 24px |
| Major page sections | 24 to 32px |

Control-height tokens are:

- `h-control-sm`: 36px, for dense desktop-only controls.
- `h-control`: 40px, for normal controls.
- `h-control-touch`: 44px, for mobile and primary touch actions.

Do not introduce arbitrary spacing where the default scale expresses the same value.

## Radius

| Surface | Radius |
| --- | --- |
| Compact controls | 10px (`rounded-lg`) |
| Standard controls | 12px (`rounded-xl`) |
| Cards and dialogs | 16px (`rounded-2xl`) |
| Status badges | Full pill |

Existing approved hero treatments may retain their larger explicit radius. Full-screen
mobile dialogs may remain square at viewport edges. Do not apply pill shapes to normal
cards or large buttons.

## Elevation

| Token | Usage |
| --- | --- |
| `shadow-control` | Inputs and compact controls when separation is needed |
| `shadow-card` | Minimal surface lift; use sparingly with bordered cards |
| `shadow-lift` | Dialogs, menus, and exceptional focal surfaces |

Normal hierarchy should come from spacing, surface color, and borders. Avoid stacking
strong borders and broad shadows on the same surface.

## Component rules

### Buttons

- One primary action per local task area.
- Secondary actions use a neutral bordered treatment.
- Destructive actions use crimson and require the existing confirmation workflow.
- Utility actions remain visually quieter than workflow decisions.
- Mobile targets should be at least 44px high.

### Forms

- Every control requires a persistent, programmatically associated label.
- Placeholder text supplements a label; it never replaces one.
- Descriptions and errors must be connected with `aria-describedby`.
- Textareas use content-appropriate minimum height and never inherit fixed input height.
- Required and disabled states must be visible without relying on color alone.

### Tables

- Preserve approved table placement and column priority.
- Use restrained headers, consistent cell padding, and tabular numeric alignment.
- Name action columns accessibly.
- Keep horizontal scrolling locally contained where no approved mobile alternative exists.
- Empty and loading states remain inside the table's existing section.

### Status

- Map domain status values to an explicit label and semantic tone.
- Do not infer tone from translated text or substring matching.
- Always display a textual status; color and icons are supporting signals.

### Dialogs and confirmations

- Use the existing accessible Radix dialog foundation.
- Keep titles, descriptions, focus management, Escape behavior, and focus restoration.
- Long dialogs scroll internally and respect viewport safe areas.
- Async destructive actions must remain visibly busy and cannot be submitted twice.

## Navigation

- Preserve the existing desktop sidebar, topbar, and mobile navigation concept.
- Navy is the dominant navigation color.
- Teal is limited to a small active indicator or accent, never a full selected row.
- Navigation visibility continues to follow existing role and capability rules.
- Current destinations require visible styling and `aria-current` where applicable.

## Responsive rules

The supported review widths are 375, 390, 430, 768, 1024, 1280, and 1440px or wider.

- Desktop retains the approved sidebar, tables, and multi-column content.
- Tablet reduces columns without reordering approved sections.
- Mobile uses stacked content, local overflow containment, and 44px touch targets.
- Safe-area insets and shared bottom-navigation clearance must remain intact.
- Desktop and mobile may use different presentations of the same section without changing
  workflow sequence or permissions.

## Accessibility baseline

- Normal text requires at least 4.5:1 contrast; large text requires at least 3:1.
- Focus indicators use the validated brand color with visible surface offset.
- Status, errors, and selection are never communicated by color alone.
- Forms, tables, dialogs, and navigation use semantic HTML and accessible names.
- Reduced-motion preferences preserve state feedback without decorative movement.
- Browser selection and input caret colors use the GSS palette.

## Deferred structural recommendations

The following remain explicitly outside Phase UI-1 and require separate approval:

1. Converting Employee 360 stacked sections into tabs.
2. Moving the Presensi status/action ahead of the map.
3. Moving secondary Employee table actions into an overflow menu.
4. Replacing authority-only mobile tables with card presentations.

## Phase UI-1 implementation boundary

Phase UI-1 changes only semantic tokens, Tailwind theme integration, typography tokens,
spacing tokens, radii, elevation, global contrast defaults, and this documentation.
Shared component behavior and page-by-page migration begin only after Phase UI-2 approval.
