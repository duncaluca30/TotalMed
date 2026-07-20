# Styling Foundation Consolidation — Design

**Date:** 2026-07-21
**Area:** Frontend look & feel (Phase A of "Polish & foundation")
**Type:** Refactor with one intended visible change (base font size)

## Problem

The frontend runs **two parallel styling systems that fight each other**:

1. An **MUI theme** in `frontend/src/main.jsx` (primary color, gradient `containedPrimary`
   buttons, `shape.borderRadius`, typography).
2. A **hand-rolled global CSS system** in `frontend/src/App.css` with `:root` design
   tokens, `.card`, utility classes, and global `button` / `input` rules.

Symptoms of the collision:

- `frontend/src/App.css:70` uses `button:not([class*="Mui"])`, `input:not([class*="Mui"])`
  — global CSS that must actively dodge MUI so the two systems don't collide. This hack
  guards **exactly 1 raw `<button>` and 1 raw `<input>`** in the whole app.
- The brand color `#5b4fe6` and the `135deg` gradient are hardcoded in **both**
  `main.jsx` and `App.css`, plus inline in components — **54 hardcoded brand-color
  occurrences** total. Changing a color means editing 3+ places.
- **No `<CssBaseline />`**; a manual `* { margin:0; padding:0 }` reset is used instead
  (App.css:18).
- Conflicting page widths: `index.css` sets `#root { width: 1126px }` while `App.css`
  sets `.container { max-width: 900px }`. Desktop-first, fixed pixel width.
- Base `font-size: 18px` (index.css:3) — unusually large; everything downstream is sized
  in `em` off this root.

**Why it matters:** every future look-&-feel improvement (dark mode, spacing, mobile,
restyling all cards at once) is painful until this is a single system. This phase makes
the foundation coherent so later polish is cheap.

## Goal

One source of truth for design tokens, with the MUI theme authoritative. The parallel
global-CSS token/reset/component layer goes away or is reduced to a thin bridge. The app
should look **~identical** afterward, except the deliberate base-font change below.

## Non-goals (YAGNI)

- Dark mode (deferred — separate slice).
- Any visual redesign / new visual direction.
- Migrating the 18 files using `.card` (and other utility classes) to styled components.
  Class names stay; only their *source of truth* changes. Full component migration is a
  later increment.

## Approach

Chosen approach: **Foundation-first consolidation** (vs. "visible wins first" or "full
redesign"). Higher up-front effort, but every subsequent polish task gets ~3x faster and
the app stops drifting between two systems.

### 1. Extract the theme

Create `frontend/src/theme.js` exporting the MUI theme. Move into it the full token set
currently split between `main.jsx` and App.css's `:root`:

- brand primary + gradient, secondary, success/warning/danger
- text colors (dark/light), background, card bg/border
- border radius, soft shadow
- typography (font family, base size), component overrides (`MuiButton`, etc.)

`main.jsx` imports the theme instead of defining it inline. This becomes the **only**
place `#5b4fe6` and the gradient are written.

### 2. Bridge tokens to legacy CSS

The theme emits its tokens as CSS custom properties (`--primary`, `--primary-grad`,
`--card-bg`, `--soft-shadow`, …) via MUI `CssBaseline` `styleOverrides` (or a
theme-derived `:root` block generated from the single token object). Existing
`var(--primary)` usages in App.css keep working unchanged.

Result: one definition, two consumers (MUI `sx` + legacy CSS classes). The duplicated
`:root` token block in App.css is deleted; App.css utility classes now read the bridged
variables.

### 3. Add CssBaseline

Add `<CssBaseline />` in `main.jsx`. Remove the manual `* { margin:0; padding:0 }` and
`body` resets from App.css / index.css. Move the page background radial gradient
(App.css:26) into the theme's `MuiCssBaseline` `styleOverrides`.

### 4. Delete the split-brain rules

- Convert the 1 straggler raw `<button>` and 1 raw `<input>` to MUI `Button` /
  `TextField`.
- Delete the global `button:not([class*="Mui"])` / `input:not([class*="Mui"])` rules and
  the `.btn-danger` / `.btn-success` / `.btn-secondary` globals (each used in ~1 file;
  fold into MUI where used).
- Remove the `:not([class*="Mui"])` hack entirely.

### 5. Keep class names, single-source their values

`.card` (18 files), `.text-muted` (14), `.container` (9), `.page-heading`,
`.section-divider`, `.record-notes`, `.access-code-*`, `.login-branding`, etc. **keep
their class names** (no churn across 18 files) but are driven by the bridged tokens from
step 2.

### 6. Fix the container

Resolve `#root { width: 1126px }` (index.css) vs `.container { max-width: 900px }`
(App.css) into a single fluid container: `max-width` ~1200px + responsive horizontal
padding, no fixed pixel width. `#root` stops hardcoding a width.

### 7. Base font size 18px → 16px (intended visible change)

Lower `index.css` base `font-size` from 18px to 16px for a more standard, refined feel.
This shifts every `em`-based size slightly smaller across the app — the one deliberate
visual change in this phase. Approved by user.

### 8. Kill remaining hardcoded colors

Replace hardcoded `#5b4fe6` / `#7c3aed` / `#4f46e5` / `#6d28d9` occurrences with theme
references (`theme.palette...` in `sx`, or `var(--primary)` in CSS). Pragmatic, not
big-bang: the bridge from step 2 means most existing `var()` usages already resolve
correctly; this step catches the inline literals (e.g. `PatientLayout.jsx:156`).

## Verification

No frontend tests exist (that slice was deferred). Verification is:

1. `cd frontend && npm run build` passes with no errors.
2. `npm run lint` passes.
3. Before/after visual smoke check of the key screens:
   - Login (`LoginForm`)
   - Patient dashboard + Health/History/Access-log tabs (`PatientLayout`)
   - Doctor vault (`PatientVault`)
   - Public emergency card (`EmergencyCard`)

   Confirm no unintended visual regression; the only expected difference is the slightly
   smaller base font.

## Risk / rollback

Low risk. The change is mostly moving where values are defined. The riskiest edits are
deleting the global reset (mitigated by `CssBaseline`) and the container width change
(mitigated by the visual smoke check). All work happens on a branch; revert is a single
`git` operation if the smoke check regresses.

## Follow-on increments (not this phase)

- Dark mode (now nearly free once tokens are unified).
- Migrate `.card` / utility classes to styled components.
- Standardize loading / empty / error states across all screens.
- Stand up a Vitest + React Testing Library harness so refactors like this are guarded.
