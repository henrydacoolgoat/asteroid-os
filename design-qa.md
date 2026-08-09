# Design QA

- Reference: `Screenshot 2026-08-09 173737.png` (1903 × 851), focused on the MessageX video-call self preview.
- Implementation: the existing MessageX call layout and styling were preserved; only the self-preview width was reduced.
- Desktop geometry: `clamp(108px, 10vw, 170px)` with the existing 9:16 ratio, bottom/right offsets, mirror transform, border, radius, and label behavior preserved.
- Browser measurement at 1280 × 720: 128 × 227.55 pixels, 14 pixels from the right edge and 96 pixels above the bottom controls.
- Mobile geometry: `clamp(92px, 25vw, 126px)` so the self preview remains compact without covering the controls.
- Visual comparison: the oversized 329 × 579 reference self view is materially smaller, remains legible, does not overlap the header or controls, and retains the original MessageX visual language.
- FreePeriod visual check: 300 game cards render, tested cover images resolve visibly, and 2048 opens and returns to the covered catalog correctly.

final result: passed
