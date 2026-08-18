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
