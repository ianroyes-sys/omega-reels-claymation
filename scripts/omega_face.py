"""Render Omega's shots for a reel: a stop-motion keyframe plus a procedurally drawn LED face.

usage: python3 omega_face.py <reel-id>
reads  scripts/<id>-plan.json, audio/<id>-timings.json, audio/<id>/proc/NN.wav, characters/b-*.png
writes renders/<id>/shots/NN.mp4 for every plan entry whose src is "omega"

Each plan entry picks a keyframe ("close-neutral", "close-folded", "close-present", "close-hips", "wide")
and an expression track: [[seconds_into_line, expression], ...]. The mouth follows the line's audio
when Omega is the speaker; on reaction shots (an Ian line) the mouth stays shut.
"""
import os, json, math, random, subprocess, sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
FF = os.environ.get("FFMPEG", "ffmpeg")
reel = sys.argv[1] if len(sys.argv) > 1 else "01"
FPS = 12
OUT_W, OUT_H = 1440, 1080
SCALE = OUT_W / 2400
CYAN = (62, 240, 232)

# Screen rectangles measured on the 2400x1792 keyframes (x0, y0, x1, y1), already inset from the bezel.
KEYS = {
    "close-neutral": ("b-close-neutral.png", (716, 362, 1016, 574)),
    "close-folded": ("b-close-folded.png", (716, 362, 1016, 574)),
    "close-present": ("b-close-present.png", (716, 362, 1016, 574)),
    "close-hips": ("b-close-hips.png", (716, 362, 1016, 574)),
    "wide": ("b-wide.png", (1660, 456, 1836, 614)),
}
COLS, ROWS = 22, 16


def eye(d, cx, cy, kind, side, put):
    """Draw one eye on the pixel grid centred at (cx, cy). side is -1 (left) or 1 (right)."""
    if kind == "open":
        for x in range(cx - 1, cx + 2):
            for y in range(cy - 2, cy + 3):
                put(x, y)
    elif kind == "half":  # flat top lid: unimpressed
        for x in range(cx - 2, cx + 3):
            put(x, cy - 1)
        for x in range(cx - 1, cx + 2):
            put(x, cy)
            put(x, cy + 1)
    elif kind == "closed":
        for x in range(cx - 2, cx + 3):
            put(x, cy + 1)
    elif kind == "happy":  # upside-down U
        for x in (cx - 2, cx + 2):
            put(x, cy + 1)
        for x in (cx - 1, cx + 1):
            put(x, cy)
        put(cx, cy - 1)
    elif kind == "stern":  # angled brow over a half eye
        for i in range(5):
            put(cx - 2 + i, cy - 3 + (i if side < 0 else 4 - i) // 2)
        for x in range(cx - 1, cx + 2):
            put(x, cy)
            put(x, cy + 1)
    elif kind == "raised":  # open eye with a raised brow
        for x in range(cx - 2, cx + 3):
            put(x, cy - 5)
        for x in range(cx - 1, cx + 2):
            for y in range(cy - 2, cy + 3):
                put(x, y)
    elif kind == "squint":
        for x in range(cx - 2, cx + 3):
            put(x, cy)
        put(cx - 2, cy - 1)
        put(cx + 2, cy - 1)


# expression -> (left eye, right eye, resting mouth)
EXPR = {
    "flat": ("half", "half", "line"),
    "dry": ("half", "raised", "line"),
    "smug": ("half", "half", "smirk"),
    "explain": ("open", "open", "line"),
    "warm": ("happy", "happy", "smile"),
    "sigh": ("closed", "closed", "line"),
    "firm": ("stern", "stern", "line"),
    "skeptic": ("squint", "raised", "line"),
    "listen": ("open", "open", "line"),
}


def mouth(put, cx, cy, kind, open_px):
    if open_px > 0:  # talking: a rectangle whose height follows the audio
        w = 4 if open_px < 3 else 3
        for x in range(cx - w, cx + w + 1):
            for y in range(cy - open_px // 2, cy + (open_px + 1) // 2 + 1):
                put(x, y)
        return
    if kind == "line":
        for x in range(cx - 4, cx + 5):
            put(x, cy)
    elif kind == "smirk":
        for x in range(cx - 4, cx + 3):
            put(x, cy)
        put(cx + 3, cy - 1)
        put(cx + 4, cy - 2)
    elif kind == "smile":
        for x in range(cx - 3, cx + 4):
            put(x, cy + 1)
        put(cx - 4, cy)
        put(cx + 4, cy)


def face_layer(size, box, expr, open_px, blink, look):
    """Return an RGBA layer with the pixel face drawn inside box (output-pixel coords)."""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = box
    cell = min((x1 - x0) / COLS, (y1 - y0) / ROWS)
    ox = x0 + ((x1 - x0) - cell * COLS) / 2
    oy = y0 + ((y1 - y0) - cell * ROWS) / 2
    gap = max(1.0, cell * 0.14)

    def put(cx, cy):
        if 0 <= cx < COLS and 0 <= cy < ROWS:
            px, py = ox + cx * cell, oy + cy * cell
            d.rectangle([px + gap / 2, py + gap / 2, px + cell - gap / 2, py + cell - gap / 2], fill=CYAN + (255,))

    le, re_, m = EXPR[expr]
    if blink:
        le = re_ = "closed"
    ex = look
    eye(d, 7 + ex, 6, le, -1, put)
    eye(d, 14 + ex, 6, re_, 1, put)
    mouth(put, 11 + ex // 2, 12, m, open_px)
    glow = layer.filter(ImageFilter.GaussianBlur(cell * 0.9))
    out = Image.alpha_composite(glow, layer)
    return out


def rms_track(wav, n_frames):
    raw = subprocess.run([FF, "-v", "quiet", "-i", str(wav), "-ac", "1", "-ar", "24000", "-f", "f32le", "-"],
                         capture_output=True).stdout
    x = np.frombuffer(raw, np.float32)
    hop = 24000 // FPS
    vals = [float(np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2))) if i * hop < len(x) else 0.0
            for i in range(n_frames)]
    peak = max(vals) or 1.0
    return [v / peak for v in vals]


def main():
    plan = json.load(open(ROOT / f"scripts/{reel}-plan.json"))
    timing = json.load(open(ROOT / f"audio/{reel}-timings.json"))
    lines = timing["lines"]
    total = timing["total"] + 2.0
    shots = ROOT / f"renders/{reel}/shots"
    shots.mkdir(parents=True, exist_ok=True)
    bgs = {}
    for i, ln in enumerate(lines):
        n = ln["n"]
        p = plan[str(n)]
        if p["src"] != "omega":
            continue
        t0 = ln["start"]
        t1 = lines[i + 1]["start"] if i + 1 < len(lines) else total
        nf = math.ceil((t1 - t0) * FPS) + 2
        key = p["key"]
        if key not in bgs:
            f, box = KEYS[key]
            im = Image.open(ROOT / "characters" / f).convert("RGB").resize((OUT_W, OUT_H), Image.LANCZOS)
            bgs[key] = (im, tuple(int(v * SCALE) for v in box))
        bg, box = bgs[key]
        speaking = ln["who"] == "OMEGA"
        amp = rms_track(ROOT / f"audio/{reel}/proc/{n:02d}.wav", nf) if speaking else [0.0] * nf
        talk_end = (ln["end"] - t0) * FPS
        track = sorted(p["expr"])
        rnd = random.Random(n)
        next_blink = rnd.uniform(1.0, 2.5) * FPS
        out = shots / f"{n:02d}.mp4"
        enc = subprocess.Popen([FF, "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                                "-s", f"{OUT_W}x{OUT_H}", "-r", str(FPS), "-i", "-",
                                "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                                str(out)], stdin=subprocess.PIPE)
        look = p.get("look", 0)
        for k in range(nf):
            t = k / FPS
            expr = [e for s, e in track if s <= t][-1] if any(s <= t for s, _ in track) else track[0][1]
            blink = next_blink <= k < next_blink + 2 and expr not in ("sigh", "warm")
            if k >= next_blink + 2:
                next_blink = k + rnd.uniform(2.5, 4.5) * FPS
            a = amp[k] if k < talk_end else 0.0
            open_px = 0 if a < 0.12 else min(5, 1 + int(a * 5))
            # Stop-motion: a hair of frame-to-frame drift and exposure flicker, like a re-shot puppet.
            jx, jy = rnd.choice((-1, 0, 0, 1)), rnd.choice((-1, 0, 0, 1))
            frame = ImageChops.offset(bg, jx, jy)
            frame = ImageEnhance.Brightness(frame).enhance(1 + rnd.uniform(-0.012, 0.012))
            bob = 1 if (open_px >= 3 and k % 4 < 2) else 0
            fb = (box[0] + jx, box[1] + jy - bob, box[2] + jx, box[3] + jy - bob)
            layer = face_layer((OUT_W, OUT_H), fb, expr, open_px, blink, look)
            frame = frame.convert("RGBA")
            frame.alpha_composite(layer)
            enc.stdin.write(frame.convert("RGB").tobytes())
        enc.stdin.close()
        enc.wait()
        print(f"{n:02d} {key:<14} {t1 - t0:5.2f}s {'talk' if speaking else 'react'}")


if __name__ == "__main__":
    main()
