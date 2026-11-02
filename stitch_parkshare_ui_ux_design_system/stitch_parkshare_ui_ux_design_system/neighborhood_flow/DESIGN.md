---
name: Neighborhood Flow
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#444653'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#757684'
  outline-variant: '#c4c5d5'
  surface-tint: '#3755c3'
  primary: '#00288e'
  on-primary: '#ffffff'
  primary-container: '#1e40af'
  on-primary-container: '#a8b8ff'
  inverse-primary: '#b8c4ff'
  secondary: '#006c4a'
  on-secondary: '#ffffff'
  secondary-container: '#82f5c1'
  on-secondary-container: '#00714e'
  tertiary: '#532a00'
  on-tertiary: '#ffffff'
  tertiary-container: '#743d00'
  on-tertiary-container: '#ffa85d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c4ff'
  on-primary-fixed: '#001453'
  on-primary-fixed-variant: '#173bab'
  secondary-fixed: '#85f8c4'
  secondary-fixed-dim: '#68dba9'
  on-secondary-fixed: '#002114'
  on-secondary-fixed-variant: '#005137'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.04em
  number-bay:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 32px
    letterSpacing: -0.03em
  keypad-digit:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

The design system establishes a warm, hyper-tactile, consumer-grade utility aesthetic tailored for hyper-local residential coordination. Rather than presenting parking as an austere enterprise asset management tool, the visual language prioritizes glanceability, domestic calmness, and peer-to-peer transparency. 

Every interaction mirrors the effortless convenience of an everyday household remote or smart intercom. High typographic clarity, purposeful tactile surfaces, and unmistakable micro-indicators guarantee friction-free operation on a mobile screen while stepping out of a car or arriving in an alleyway. State changes prioritize immediate legibility over stylistic decoration, leaning on friendly geometry, crisp separation, and high-contrast dual-encoding (color + icon + text) to avoid ambiguity among neighbors.

## Colors

The palette balances clean architectural light neutrals with decisive semantic signaling:

- **Primary Action (Cobalt/Indigo - `#1E40AF`):** Drives interactive operations such as claiming slots, booking time blocks, verifying unit PINs, and confirming actions. Hover and active states tint cleanly into darker navy (`#1E3A8A`).
- **Available / Vacant (Emerald - `#059669`):** Indicates currently open spaces. Supported by soft green tinted container surfaces (`#ECFDF5`) and emerald boundary rings.
- **Occupied / Locked (Rose - `#E11D48`):** Unambiguously denotes taken spots, expired slots, or active reservations by other units. Supported by tinted backgrounds (`#FFF1F2`).
- **Transitioning / Upcoming (Amber - `#D97706`):** Communicates slots freeing up soon (e.g., within 15–30 minutes) or reserved arrivals pending. Supported by warm ambient fills (`#FFFBEB`).
- **Canvas & Neutral Foundation (Slate 50 to Slate 900):** The app canvas rests on `#F8FAFC` (Slate-50), layered cards sit on `#FFFFFF`, text hierarchies command `#0F172A` (headings) down to `#475569` (secondary labels), and borders use `#E2E8F0`.

Color is never used as the single signifier of state; semantic colors must strictly pair with explicit typographic tokens and SVG geometric markers (e.g., checkmark, lock/car silhouette, clock icon).

## Typography

The design system uses **Plus Jakarta Sans** across all hierarchies to maintain a modern, clean, and friendly posture with wide open counters, ensuring high optical legibility on compact mobile screens.

Key specialized scales:
- **`number-bay`**: Emphasizes parking bay numbers (1–8) with heavy optical punch so residents can instantly match the bay painted on the asphalt to the screen.
- **`keypad-digit`**: Ensures large, clear target labels for apartment security code inputs.
- **`label-sm`**: All-caps tracking applied to status pill badges (`FREE NOW`, `OCCUPIED`, `EXPIRING`) for instant scanning.

## Layout & Spacing

Layouts are designed mobile-first targeting standard 390px viewport widths with minimal lateral friction:

- **Screen Canvas:** Outer margins are fixed to `margin: 1rem` (16px) on mobile viewports, expanding to `1.5rem` (24px) on tablet/desktop viewports within a max-width container of `480px` (or `720px` for multi-column building overview tablets).
- **The 8-Bay Status Grid:** Structured as a fixed 2-column × 4-row layout on mobile devices (`390px` to `600px`), with each bay card filling equal fractional width separated by `gutter: 0.75rem`. On tablets and wider screens, it transitions into a 4-column × 2-row panoramic lot arrangement.
- **Vertical Rhythm:** Content sections (lot status, active reservation alert, schedule actions) are partitioned by `space-xl` (24px) intervals.
- **Touch Ergonomics:** All primary tappable elements strictly observe a minimum physical hit area of 44 × 44px, with dense elements padded via `space-md` internally.

## Elevation & Depth

Visual depth is conveyed through tactile tonal layering combined with soft, low-radius ambient drop shadows:

- **Level 0 (Canvas):** Background `#F8FAFC`, flat.
- **Level 1 (Default Cards & Bay Slots):** Pure white background (`#FFFFFF`), wrapped in a crisp 1px border (`#E2E8F0`), with an ambient shadow: `0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)`.
- **Level 2 (Active/Selected Card & Floating Navigation):** White background, border tinted to state color or `#CBD5E1`, with shadow: `0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`.
- **Level 3 (Modals & Keypad Sheets):** Surface `#FFFFFF`, floating over a scrim of `rgba(15, 23, 42, 0.45)` with blur filter `backdrop-blur-sm`, elevated with `0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08)`.

Active slots utilize a 2px inner ring (`ring-2`) matched to their semantic state (green, amber, or rose) rather than excessive elevation shifts.

## Shapes

The roundedness language is cohesive and friendly (`roundedness: 2` base):
- **Base Surfaces & Cards:** Standard `rounded-xl` (12px / `0.75rem`) to soften the edges of parking bays and informational blocks while maintaining grid efficiency.
- **Modals & Bottom Drawers:** `rounded-t-2xl` (16px / `1rem`) for smooth tactile sliding upward from the bottom screen edge.
- **Status Pills & Chips:** Fully pill-shaped (`rounded-full` / 9999px) to establish visual contrast between structural containers (squares/rectangles) and dynamic tags.
- **Keypad Buttons:** Rounded circular buttons (`rounded-full`) or smooth rounded squares (`rounded-xl`).

## Components

### 1. Parking Bay Cards & 8-Bay Grid
- **Structure:** Displays bay number prominently in top-left using `number-bay`.
- **Visual Feedback:** 
  - *Free:* Light green surface (`#ECFDF5`), emerald border (`#A7F3D0`), green status badge (`#059669` text, `#D1FAE5` background) with a checkmark icon.
  - *Occupied:* Neutral white surface with soft rose accent boundary (`#FECDD3`), red badge (`#E11D48`), showing occupying unit identifier (e.g., "Apt 3B") and remaining time label.
  - *Soon Available:* Amber badge with clock icon and time-until-departure countdown (e.g., "Free in 18m").
- **Interaction:** Tap triggers slot action drawer (claim, release, or view details).

### 2. Apartment Code Keypad Modal
- **Layout:** Centered bottom-sheet modal. 
- **PIN Indicator:** 4 horizontal circular pill slots showing entered digits or masked secure dots.
- **Keypad Grid:** 3x4 grid featuring numeric keys (1–9, Clear, 0, Backspace). Keys use 64px circular hit targets in soft slate-100 (`#F1F5F9`) with active tactile compression (`scale-95`).

### 3. Quick Time Pickers
- **Format:** Horizontally scrollable row of segmented duration chips (`15m`, `30m`, `1h`, `2h`, `Overnight`, `Custom`).
- **Styling:** Inactive chips have `#F1F5F9` background and `#475569` text. Selected chips shift to primary cobalt background (`#1E40AF`) with `#FFFFFF` text.

### 4. Recurring Schedule Pills
- **Format:** Compact day-of-week selection chips (M, T, W, T, F, S, S) coupled with toggle switches for building lease rules or regular shared commute swaps.
- **Visuals:** Minimal border with high-contrast active fill.

### 5. Bottom Mobile Tab Navigation
- **Placement:** Fixed sticky bar docked at `bottom-0`, inset with safe-area padding for mobile home indicators.
- **Elevation:** Surface `#FFFFFF` with top border `#E2E8F0` and Level 2 ambient shadow.
- **Tabs:** 3 primary items ("Bay Grid", "My Unit / Book", "Building Activity"). Active state marked with cobalt `#1E40AF` icon and a 4px dot below the label.

### 6. Buttons & Interactive Controls
- **Primary Button:** `#1E40AF` background, white label, full-width on mobile (`h-12`, 48px height), `rounded-xl`, bold font weight.
- **Secondary Button:** Outlined `#E2E8F0` with `#0F172A` text, hover `#F8FAFC`.
- **Destructive/Release Button:** Soft red `#FFF1F2` background with `#E11D48` text.