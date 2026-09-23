# Official pet artwork

The eight replaceable sprite sheets are the built-in companions shown on the
[official ChatGPT Pets page](https://learn.chatgpt.com/docs/pets): Codey, Dewey,
Fireball, Rocky, Seedy, Stacky, BSOD and Null Signal.

Artwork: OpenAI; respective rights remain with OpenAI. Original asset URLs and
SHA-256 checksums are recorded in `sources.json`. These artwork files are distinct
from this project's editable SVG companions. No endorsement is implied.

`SpritePet.tsx` crops the 8-column, 9-row atlas into 192 × 208 frames. Work uses
row 7 (typing) and row 6 (thinking); resting uses a closed-eye idle frame plus a
host-controlled breathing motion and sleep marks. Status lamps and all scene
components remain independent. Replace a skin file or adjust its clip mapping to
customize a character; no network access is needed at runtime.

Frame-layout reference:
https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/model.rs

The color selector applies a reversible hue/saturation/brightness tint to the frame
renderer. Base palette values are in `OFFICIAL_COLORS`; restoring the base color
removes the filter. Sprite source files stay intact. Canvas hover uses the pickup
clip; sidebar portraits use a still clip with gentle breathing.

## Community companions

The six additional pets are reused sprites, not locally generated drawings:

- Woodi, Inky, Byte and WonderCube: https://github.com/Schrotty74/chatgpt-pets
- Marmalade and Voltcoin: https://github.com/aprocom/chatgpt-pets

Both repositories publish under MIT; full notices are in `licenses/`. Pinned commit,
original URL and SHA-256 are recorded for each file in `sources.json`. Assets remain
unmodified. Their v2 atlases are 1536 × 2288; the player preserves original cell size
and uses the standard jump/work clips. Closed-eye frames were visually selected for
rest, with host-controlled breathing and Z marks. The palette filter is reversible.

Earlier hand-drawn characters were removed. Old IDs resolve to these new skins
without rewriting employee records. Every pet shares the Fireball hover rhythm;
reduced-motion preferences disable animated movement.
