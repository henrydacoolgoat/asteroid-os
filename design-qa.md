# Asteroid OS One shelf design QA

## Visual target

- Selected reference: `C:\Users\henry_x0k28gt\.codex\generated_images\019ff5d5-3dec-7ef0-9e98-877d5d344f66\exec-db421374-081f-4cf5-90ef-8f7ce76df0ad.png`
- Reference size: 1672 × 941 pixels (16:9)
- Implementation screenshot: `design-qa/implementation.png`
- Implementation viewport: 1280 × 720 pixels (16:9)
- Comparison evidence: `design-qa/comparison-full.png` and `design-qa/comparison-shelf.png`
- State: signed-in Asteroid OS One desktop with Notes open and the shelf idle

The reference was proportionally normalized to 1280 × 720 before the side-by-side comparison. The focused shelf comparison uses the bottom 100 pixels of both normalized frames.

## Pass 1 findings

- P1: the dock inherited the global `body.input-active` virtual-keyboard offset on desktop, moving the icons 24 pixels below the viewport.
- P2: the search control and pinned app icons were oversized relative to the selected shelf reference.
- P2: battery and quick controls appeared as separate pills rather than one compact grouped control.

## Fixes applied

- Limited the input-driven dock offset to compact/touch layouts while preserving the virtual-keyboard behavior.
- Matched the normalized reference scale with a 220 × 36 search control, 34-pixel app artwork, 40-pixel dock targets, and 12-pixel icon spacing.
- Joined Wi-Fi, volume, battery percentage, and battery state into one visually continuous quick-control group.
- Kept a dedicated notification button and two-line time/date block.
- Kept exactly five pinned apps on the shelf while retaining the full app catalog in App Grid and search.

## Functional verification

- Shelf search opened the existing Asteroid Search and returned MessageX.
- Quick controls opened the existing brightness, volume, Focus, Files sharing, and window organization panel.
- Notifications opened the existing notification center.
- Notes opened from the new pinned shelf and received the active-app underline.
- All 11 project validator suites passed after the shelf change, including 19/19 shell checks and all existing auth, Asteroid ONE, MessageX, FreePeriod, Comet, Terminal, and browser checks.

## Final comparison

The selected shelf structure, proportions, spacing, opacity, grouping, icon count, active indicator, search-led navigation, and right-side status layout match the normalized reference. The existing Asteroid wallpaper and Notes implementation remain intentionally unchanged because the selected task was the system shelf redesign, not a replacement of user wallpaper or application content.

final result: passed

## v0.99.23.18 direct-outline icon audit

- Rebuilt all 19 individual RGBA app assets in
  `assets/asteroid-icons-v3/` from the approved v2 artwork.
- Removed only the wide white perimeter bevel and both white corner wedges.
- Added one consistent three-pixel electric-violet line that directly follows the
  complete six-sided silhouette; symbols, tile interiors, order, and labels stay
  unchanged.
- Reproducible build: `refine-icon-outlines.py`.
- Evidence sheet: `design-qa/v0.99.23.18-direct-outline-icons.png`.

final result: passed

## v0.99.23.17 transparent-icon and Supabase recovery audit

### Icon asset repair

- Rebuilt all 19 supplied blue/violet app tiles without labels or cosmic-sheet
  gutters, then converted them into individual 256 × 256 RGBA PNG files under
  `assets/asteroid-icons-v2/`.
- The first two image-generation passes visually painted a checkerboard instead
  of writing alpha pixels, so they were rejected as final runtime assets. A
  deterministic alpha-mask packaging pass preserved each complete tile and
  white glyph while making every exterior corner genuinely transparent.
- Replaced the CSS sprite window with one repository image per app. Icon hosts
  now use `object-fit: contain`, `overflow: visible`, and `clip-path: none`, so
  neither the shelf nor compact search rows can crop a tile or expose a sheet
  gutter.
- Evidence sheet: `design-qa/v0.99.23.17-transparent-icons.png`.
- Automated asset audit: 19/19 mapped icons are 256 × 256 RGBA PNGs; all 24
  Asteroid OS One shell checks passed.

### Supabase-to-laptop media recovery

- Ran the installed no-admin laptop service's two-account queue integration test
  against the active Supabase project on 2026-08-18.
- A PNG entered the private Supabase queue, appeared immediately for the other
  account with its original timestamp, moved to `storage/chat-media` on the
  laptop, matched its expected byte count and SHA-256, and changed to a stable
  `messagex-laptop:` reference.
- The other account downloaded the recovered laptop file byte-for-byte. The same
  sequence passed for a profile photo and a `messagex-profile-laptop:` reference.
- Both temporary Supabase Storage objects were absent after verification. Test
  cleanup left 0 temporary users, 0 test messages, 0 test chats, 0 queue rows,
  and 0 objects in the private transfer bucket.

final result: passed

## v0.99.23.15 live-scale correction

### Evidence

- Reported live screenshot: `C:\Users\HENRY_~1\AppData\Local\Temp\codex-clipboard-b8269480-1c9c-42db-b516-379529520a00.png`
- Corrected implementation: `design-qa/v0.99.23.15-desktop.png`
- Before/after comparison: `design-qa/comparison-v0.99.23.15.png`
- Local preview viewport: 1280 × 720 pixels

### Visible problems confirmed

- P1: the bright abstract wallpaper dominated the interface and read as a generic
  Apple-like desktop rather than Asteroid OS One.
- P1: the two large built-in desktop shortcuts added noise without improving app
  discovery because Files and search were already available from the shelf.
- P2: the 66-pixel CSS shelf became roughly 100 physical pixels at the reporter's
  Windows display scale, making every control feel oversized.
- P2: search, the five pinned icons, quick controls, notifications, and the clock
  were individually reasonable but collectively too wide and visually heavy.

### Corrections

- Added the original generated `assets/asteroid-os-one-cosmic-wallpaper-v1.png`
  as a real repository asset. It keeps the center dark and puts restrained
  violet nebula, asteroid, and orbital detail around the edges.
- Added a one-time migration for accounts still on wallpaper 1 while preserving
  every explicitly selected wallpaper.
- Reduced the desktop shelf from 66 to 54 CSS pixels, the search field to
  188 × 32 pixels, and pinned artwork to 30 × 30 pixels.
- Tightened the quick-control, battery, notification, and clock group without
  removing any existing action.
- Hid only the two built-in desktop shortcuts. User-added web apps still render,
  launch, and retain their draggable positions.
- Kept the opaque black shelf, five deliberate pinned apps, repository icon
  artwork, standard window controls, and all pre-existing application behavior.

### Visual result

The corrected desktop has a calm central working area, an unmistakable Asteroid
space identity, no redundant default shortcuts, and a shelf that remains compact
under display scaling. The before/after comparison confirms materially lower
visual noise and better balance without introducing a translucent dock or a top
menu bar.

final result: passed

## v0.99.23.16 compact-icon and browser-status audit

### Scope and evidence

- User goal: remove the broken-looking black gutters around compact Asteroid app
  icons and remove hardware indicators that a browser OS does not control.
- Reported screenshot: `C:\Users\HENRY_~1\AppData\Local\Temp\codex-clipboard-ef11dbf7-d123-4923-85f0-6ff2d9c852fb.png`
- Repaired Search at the reported 906 × 478 viewport:
  `design-qa/v0.99.23.16-search-narrow.png`
- Repaired App Grid at the same viewport:
  `design-qa/v0.99.23.16-app-grid-narrow.png`

### Step 1 — Search results

- Health before: poor. The 34-pixel icon host exposed black sheet gutters because
  the sprite viewport was wider than the supplied icon tile.
- Health after: passed. The sprite is tightly centered on the original repository
  artwork, and Files, App Grid, MessageX, Shards, FreePeriod, and Mail remain
  recognizable without black wedges or neighboring-sheet space.
- Accessibility: every result remains a labeled button; the visual repair does
  not replace accessible names with image text.

### Step 2 — Full App Grid

- Health after: passed. The same corrected crop scales cleanly to the 76-pixel
  application tiles and preserves all 19 supplied Asteroid icons.
- Accessibility: the grid keeps one named button per application and the search
  field retains its label and keyboard path.

### Step 3 — Browser OS shelf

- Health after: passed. Wi-Fi, volume, shelf battery, lock-screen battery, and
  the battery startup probe are removed. Notifications and time/date remain.
- The bell uses an explicit grid-centering rule. At 906 × 478, its 16 × 16 box
  is centered exactly inside the 32 × 30 notification button; the unread badge
  remains anchored to that button.
- Accessibility: the notification control keeps the `Open notifications` label,
  keyboard focus behavior, and minimum mobile target size.

### Evidence limits

- Screenshot evidence confirms layout, crop, and visible controls at the reported
  viewport. Keyboard and semantic behavior are additionally covered by DOM
  inspection and automated project validation, but this is not a claim of full
  WCAG conformance.

final result: passed
