# Clay Multiverse · 黏土多元宇宙 — Style Prompt

> A 9:16 comedy explainer. A clay duo (an eager young man, a deadpan desk robot with a pixel screen face) argue at a night desk in the lower half. Above them, a UI card shows what the tool is really doing, and at every step the card jumps to a new universe. A rainbow ring studded with the robot's eyes blooms and bursts to white on each jump.
> Technique base: lemo-opuscar `hologram-hud` (the home universe). Borrowed: `ascii-crt`; OPUSCAR 98 #77 *Million Dollar Baby* (16-bit arcade), #97 *Anora* and #78 *Crash* (neon night grade), #95 *Everything Everywhere All at Once* (the jump). Production files: this repo (`scripts/`, `ui/universe.css`).

## 1. Essence, and what it is not
Two halves of one frame, always:
- **Bottom 1020 px: a clay world.** Handmade stop-motion claymation on twos. The cast is locked and keyframed (Ian, Omega), lit like a dorm room at night. The robot's face is a code-drawn LED grid, never generated.
- **Top 900 px: a code-drawn card.** It shows the real tool (real commands, file names, numbers from the README), and its look depends on the universe.

The comedy is the duo's. The style's job is to make each step feel like a new world without losing the cast. Not a 2D mascot explainer (the cast is clay), not a pure motion-graphics piece (the people carry it), not a live-action talking head.

## 2. Materials & rendering
- **Clay:** AI keyframes and Seedance lip-sync shots for Ian only. Omega's shots are stills plus a procedural face, with ±1 px jitter and brightness flicker per frame so they read as re-shot puppets. Everything is held on twos (12 fps).
- **Cards:** HTML/CSS rendered frame by frame (Playwright), poses quantised to 12 fps. On each new scene the card is yanked in and out in four held poses.
- **HUD furniture in every universe:** corner brackets, and the tag `UNIVERSE 0N // NAME` bottom right.

## 3. Colour logic
- **Base grade on the clay** (every universe): blue-violet shadows, warm sodium highlights, bloom (screen blend at 22% of a σ22 blur), vignette, moving grain.
- **Per universe:**

  | Universe | Card | Clay grade |
  |---|---|---|
  | holo (home) | one hue: cyan #7FF3FF lines on near-black #04090D; accent pink #FF4FA8; dark plates with 2 px glowing borders | cool lift |
  | crt | amber phosphor #FFB000 on #0E0700; scanlines and glass vignette over the card | warmed toward amber |
  | arcade | #1D1435 purple, gold #F5C53A, red #FF3B5C; 6–18 px hard black/gold frames, hard drop shadows, no radii | pixelated ×4, nearest-neighbour, saturated |
  | neon | night #1E1838; pink #FF4FA8 and cyan #4FDCFF glass tubes with white-hot cores; falling snow; wet reflection band at the bottom | magenta-blue shadows, more saturated |

- **Jump ring:** #e5322d #f7c928 #1fa39a #2a6fc0 #e0478f.
- **Captions:** Ian white, Omega cyan #3EF0E8.

## 4. Type
- holo: Inter 700 titles, JetBrains Mono for UI.
- crt: VT323 everywhere, uppercase titles.
- arcade: Press Start 2P for titles and pills, VT323 for body.
- neon: Monoton titles with tube glow, Inter body.
- Captions: Avenir Next Heavy, uppercase, 1–3 words, burned at y≈955 with a soft edge.
- One accent word per title, in the universe's accent colour.

## 5. Motion
- Held poses on twos everywhere. Something changes on the card about every 0.6 s: type-ons, stamps, counters rolling, cursors.
- The robot's face changes expression per line and blinks. Its mouth follows the voice's loudness. When Ian talks off camera it reacts with a sideways look.

## 6. Camera
Locked-off shots in the clay. Cuts happen on line changes only (close-up, wide, or a reaction close-up). There are no camera moves on the cards beyond the yank in and out.

## 7. Sound palette
- **Score:** original, 90 BPM, A minor (Am F C G). The arrangement changes with each universe:
  - holo: soft detuned pads and a sub pulse;
  - crt: 25% pulse-wave arpeggio;
  - arcade: chiptune (square lead, triangle bass, noise snare);
  - neon: synthwave (pumping saw bass, gated snare).
  It is ducked under the voices with a sidechain.
- **Effects, frame-exact from the event map:**
  - jump: the score drops out, then a riser into an impact and a glitch tail;
  - card swap: whoosh;
  - typing, stamp, notification, coin, alarm beeps and a deny buzz, as the card's phases need;
  - a tiny blip when Omega starts a line.
  Real recordings are CC0 from Openverse (`audio/sfxlib/CREDITS.json`); procedural ones come from lemo-opuscar `sfx.py`.
- **Master:** −14 LUFS.

## 8. Native moves
- **The jump**, at every universe change, 0.8 s:
  - the whole frame gets an RGB split;
  - a five-colour ring studded with Omega pixel-eye stickers and pink beads blooms from the seam (y=900) to about 80% of frame height while turning;
  - it bursts to white;
  - the cut lands under the white.
- **The counter:** a number or step meter on the card that tracks the story.
- **The robot's deadpan blink** before a roast.
- **The end card:** keyword chip, black pill with an accent glow.

## 9. Pitfalls
- Long titles overflow in arcade and neon. Keep arcade titles at 33 px or less and on one line, and neon titles at 56 px.
- Hard-coded white surfaces must be darkened per universe (universe.css covers the current set).
- Don't pixelate captions: the grade applies to the scene track only.
- Too many universes reads as noise. Use one per step and come home to holo for the result.
- Subtle universes read as a glitch, not a joke (Ian, 2026-10-27). Each jump must change the whole frame (clay and card) into an obviously different era or medium, and land on a title plate that names it. The drastic set from reel 02 v2: `silent` (1927: sepia, flicker, scratches, intertitle card, ragtime piano), `arcade` (clay pixelated ×10, crushed palette), `vhs` (1987: chroma split, tracking band, PLAY/date OSD). Whole-frame looks live in `compose.py` FRAME_FX and the plates in `multiverse.py` plate().
- Ian's hair drifts to twists in Seedance without the character sheet passed as an image reference.

## 10. Engine
- Clay: Higgsfield (nano-banana keyframes, Seedance 2.0 lip-sync) plus `omega_face.py` (PIL).
- Cards: HTML/CSS with Playwright (`ui/render.mjs`) and `ui/universe.css`.
- Jumps: `multiverse.py` (PIL, qtrle alpha).
- Grade and mix: ffmpeg (`compose.py`).
- Sound: numpy/scipy (`sound.py`, using lemo-opuscar `core/audio/sfx.py`).

## 11. Use
Hyping open-source repos and tools in 55–70 s vertical reels. The structure is a cold open, three steps (one universe each), a guardrail, a button, and a spoken comment-keyword CTA. It also works for any "here's how it works in N steps" explainer with a recurring duo.
