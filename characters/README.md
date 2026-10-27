# characters/

Keyframes for the clay cast are not in the repo. Generate your own (a character turnaround sheet per character, then close-up and wide keyframes on one set), save them here, and record their Higgsfield ids in `config/cast.json`.

`scripts/omega_face.py` expects these Omega keyframes, 2400x1792, with a blank screen on the robot's face (the script draws the LED face):

| Key | File |
|---|---|
| close-neutral | `b-close-neutral.png` |
| close-folded | `b-close-folded.png` |
| close-present | `b-close-present.png` |
| close-hips | `b-close-hips.png` |
| wide | `b-wide.png` |

If your robot's screen sits somewhere else, update the screen rectangles in `KEYS` at the top of `omega_face.py`.
Reference stills of the original cast are in `docs/stills/`.
