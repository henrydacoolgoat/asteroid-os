# Design QA

- Reference: `Screenshot 2026-08-09 173737.png` (1903 × 851), focused on the MessageX video-call self preview.
- Implementation: the existing MessageX call layout and styling were preserved; only the self-preview width was reduced.
- Desktop geometry: `clamp(108px, 10vw, 170px)` with the existing 9:16 ratio, bottom/right offsets, mirror transform, border, radius, and label behavior preserved.
- Browser measurement at 1280 × 720: 128 × 227.55 pixels, 14 pixels from the right edge and 96 pixels above the bottom controls.
- Mobile geometry: `clamp(92px, 25vw, 126px)` so the self preview remains compact without covering the controls.
- Visual comparison: the oversized 329 × 579 reference self view is materially smaller, remains legible, does not overlap the header or controls, and retains the original MessageX visual language.
- FreePeriod visual check: all 300 manifest games now have a bundled same-origin JPEG cover, with no blank-card fallback state. The catalog still renders 300 cards and 2048 opens and returns correctly.
- Game performance check: the launched game frame is eager and high priority, grants normal fullscreen/audio/gamepad capabilities, and marks itself as Asteroid high-performance mode. WebGL/WebGL2 context requests receive `powerPreference: high-performance`; 2D contexts are passed through unchanged.
- Browser measurement: 300 cards, 300 distinct local cover URLs, zero blank background images, and 300 cards restored after returning from 2048.
- Runtime inspection: the 2048 frame reported `loading=eager`, `fetchpriority=high`, `data-asteroid-performance=high`, `tabindex=0`, and the expected permission policy; its injected scripts contained the high-performance WebGL bridge.

final result: passed
