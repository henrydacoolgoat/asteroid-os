# Design QA

## Existing MessageX and FreePeriod checks

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
- Silent AFS check: startup and lock modes keep the AFS overlay at `display:none`, `aria-hidden=true`, and `inert`, while the standard lock password panel is always visible and focused. Setup/manage AFS remains visible when intentionally opened from Settings.
- AFS performance budget: 320-pixel recognition input, 480 × 360 camera request, 500 ms frame target, and a five-second total background recognition deadline.
- FreePeriod loading check: hover, pointer-down, touch-start, and keyboard focus warm the chosen game; first launches race two sources; subsequent launches use a revisioned persistent local cache.
- Cover-source check: no cover is captured from a running game. Every one of the 300 cards uses either a locally bundled published GitHub thumbnail/logo/splash/icon or the deterministic FreePeriod monogram title-card treatment; the dead Canvas archive is not requested.

## Asteroid Labs checks

- Source artwork: `C:/Users/henry_x0k28gt/Documents/Codex/2026-08-12/referenced-chatgpt-conversation-this-is-an/.codex-remote-attachments/019ff5d5-3dec-7ef0-9e98-877d5d344f66/b74798cc-af55-40af-acff-5133b4e69011/1-Photo-1.jpg`.
- Source dimensions: 1536 × 1536 JPEG.
- Implemented artwork: `assets/asteroid-labs.jpg`; SHA-256 verified to be identical to the supplied source.
- Browser viewport: 1280 × 720 CSS pixels at device pixel ratio 1.5.
- Boot screenshot: `C:/Users/henry_x0k28gt/Documents/Codex/2026-08-12/referenced-chatgpt-conversation-this-is-an/outputs/asteroid-labs-boot-glitch.png` (1280 × 720).
- Public page screenshot: `C:/Users/henry_x0k28gt/Documents/Codex/2026-08-12/referenced-chatgpt-conversation-this-is-an/outputs/asteroid-labs-public.png` (1264 × 1374 full page).
- Manager screenshot: `C:/Users/henry_x0k28gt/Documents/Codex/2026-08-12/referenced-chatgpt-conversation-this-is-an/outputs/asteroid-labs-manager.png` (1264 × 1140 full page).
- Same-viewport comparison: `C:/Users/henry_x0k28gt/Documents/Codex/2026-08-12/referenced-chatgpt-conversation-this-is-an/outputs/asteroid-labs-reference-comparison.png`; supplied artwork and boot capture were placed side by side on matching 1280 × 720 charcoal canvases.
- Visual comparison evidence: artwork, proportions, monochrome palette, LABS pill, ASTEROID wordmark, and centered square composition match because the implementation uses the original source asset directly. The takeover adds only short scan/glitch motion and a matching charcoal surround.
- Public dashboard check: six Supabase projects rendered with balanced spacing, readable typography, responsive two-column cards, project counts, and read-only group filters.
- Manager check: separate unlinked HTML rendered the publisher form and six protected Supabase records after the local key file was selected.
- Interaction check: five rapid clicks on the regular boot logo changed `#bootScreen` to `labs-unlock`, showed the artwork, then navigated to `asteroid-labs.html`. Four category filters and the all-projects filter worked; Future reduced the visible cards from six to two.
- Backend check: public read returned six records, incorrect manager key returned 401, direct anonymous insert returned 401, protected insert became publicly readable, and cleanup deletion was verified.
- Console check: no errors or warnings on either the public Labs page or the separate manager page.
- Comparison history: first implementation used the exact supplied asset and passed the same-viewport comparison; no asset substitution or visual correction was needed.

final result: passed
