"""Render the Clay Multiverse jump: one transparent overlay clip per universe change.

usage: python3 multiverse.py <reel-id>
reads  audio/<id>-events.json (kind "jump")
writes renders/<id>/jumps/jump-<k>.mov (1080x1920 qtrle with alpha, starts PRE seconds before the cut)
       renders/<id>/jumps/jumps.json  [{t0, file}]

The move, after OPUSCAR 98 #95 (Everything Everywhere All at Once): a rainbow ring of five colour segments,
studded with Omega's pixel eyes (our googly eyes) and pink beads, blooms from the frame centre to ~80% of
frame height while it turns, then bursts to white; the cut to the next universe happens under the white.
"""
import os, json, math, subprocess, sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FF = os.environ.get("FFMPEG", "ffmpeg")
reel = sys.argv[1] if len(sys.argv) > 1 else "01"
W, H, FPS = 1080, 1920, 30
PRE, POST = 0.5, 0.3           # ring blooms for PRE s before the cut, white clears over POST s after it
PLATE = (0.12, 1.15)           # after the cut a title plate names the new universe (reel 02 v2: jumps must read as intended)
FONTS = ROOT / "ui/fonts"
RING = ["#e5322d", "#f7c928", "#1fa39a", "#2a6fc0", "#e0478f"]
CYAN = (62, 240, 232)
CX, CY = W // 2, 900           # centred on the seam between the UI card and the clay scene
S = 2                          # supersample, then downsize for clean edges


def ease_out(x):
    return 1 - (1 - x) ** 3


def eye_tile(size):
    """Omega's face as a sticker: dark rounded screen, two cyan pixel eyes."""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size // 5, fill=(18, 16, 24, 255), outline=(240, 240, 240, 255), width=max(2, size // 14))
    c = size / 8
    for ex in (2.3, 4.7):
        d.rectangle([ex * c, 2.6 * c, ex * c + c, 4.6 * c], fill=CYAN + (255,))
    d.rectangle([2.8 * c, 5.6 * c, 5.2 * c, 5.6 * c + c * .6], fill=CYAN + (255,))
    return im


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def plate(u, k):
    """The universe's title card, drawn at 1x over the UI half. k = pose index since it appeared (pops on twos)."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    sc = [0.82, 1.06, 1.0][min(k, 2)]
    cx, cy = W // 2, 450

    def box(w, h):
        w, h = w * sc, h * sc
        return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]

    def text(t, f, y, fill, **kw):
        d.text((cx, cy + y * sc), t, font=f, fill=fill, anchor="mm", **kw)
    if u == "silent":
        b = box(860, 380)
        d.rectangle(b, fill=(11, 9, 6, 255), outline=(237, 227, 204, 255), width=5)
        d.rectangle([b[0] + 16, b[1] + 16, b[2] - 16, b[3] - 16], outline=(237, 227, 204, 200), width=2)
        text("Meanwhile…", font("fraunces-latin-500-italic.woff2", int(64 * sc)), -60, (237, 227, 204, 255))
        text("in 1927.", font("fraunces-latin-700-normal.woff2", int(110 * sc)), 60, (255, 250, 235, 255))
    elif u == "arcade":
        b = box(900, 360)
        d.rectangle([b[0] + 18, b[1] + 18, b[2] + 18, b[3] + 18], fill=(0, 0, 0, 200))
        d.rectangle(b, fill=(29, 20, 53, 255), outline=(245, 197, 58, 255), width=12)
        f = font("press-start-2p-latin-400-normal.woff2", int(54 * sc))
        text("PLAYER 2", f, -70, (0, 0, 0, 255))
        text("8-BIT", font("press-start-2p-latin-400-normal.woff2", int(96 * sc)), 50 + 6, (0, 0, 0, 255))
        text("PLAYER 2", f, -76, (255, 59, 92, 255))
        text("8-BIT", font("press-start-2p-latin-400-normal.woff2", int(96 * sc)), 50, (245, 197, 58, 255))
    elif u == "vhs":
        f = font("vt323-latin-400-normal.woff2", int(200 * sc))
        b = box(940, 300)
        d.rectangle(b, fill=(0, 0, 40, 170))
        for dx, col in ((-8, (255, 0, 80, 200)), (8, (0, 200, 255, 200)), (0, (255, 255, 255, 255))):
            d.text((cx + 50 * sc + dx, cy), "PLAY 1987", font=f, fill=col, anchor="mm")
            tx = cx - 430 * sc + dx  # play triangle (VT323 has no U+25B6)
            d.polygon([(tx, cy - 55 * sc), (tx, cy + 55 * sc), (tx + 90 * sc, cy)], fill=col)
    else:  # holo: back home
        b = box(820, 260)
        d.rounded_rectangle(b, radius=18, fill=(4, 13, 19, 235), outline=(127, 243, 255, 255), width=4)
        text("BACK HOME", font("vt323-latin-400-normal.woff2", int(150 * sc)), 0, (127, 243, 255, 255))
    return im


def frame(k, n_pre, seed, dest="holo"):
    t = k / FPS - PRE                      # seconds relative to the cut
    img = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    if t < 0.02:
        p = ease_out(min(1, (t + PRE) / PRE))
        r = p * 0.42 * H * S               # outer radius: ring reaches ~80% of frame height
        th = max(6, r * 0.2)
        rot = (t + PRE) * 260 + seed * 40  # degrees; the ring turns as it grows
        d = ImageDraw.Draw(img)
        box = [CX * S - r, CY * S - r, CX * S + r, CY * S + r]
        for i, col in enumerate(RING):
            a0 = rot + i * 72
            d.arc(box, a0, a0 + 72, fill=col, width=int(th))
        # beads and eyes ride the ring's centre line
        rm = r - th / 2
        n = 10
        tile = eye_tile(max(8, int(th * 1.15)))
        for j in range(n):
            ang = math.radians(rot + j * 360 / n + 18)
            x, y = CX * S + rm * math.cos(ang), CY * S + rm * math.sin(ang)
            if j % 2 == 0:
                img.alpha_composite(tile.rotate(-math.degrees(ang) - 90, expand=True),
                                    (int(x - tile.width / 2), int(y - tile.height / 2)))
            else:
                b = th * 0.28
                d.ellipse([x - b, y - b, x + b, y + b], fill="#ff8cc6", outline="#ffffff", width=max(2, int(b / 4)))
        # RGB-split ghost of the ring (smear before the jump)
        if p > 0.4:
            ghost = img.copy()
            rch, gch, bch, ach = ghost.split()
            off = int(18 * S * p)
            red = Image.merge("RGBA", (rch, gch.point(lambda v: 0), bch.point(lambda v: 0), ach.point(lambda v: v // 3)))
            blu = Image.merge("RGBA", (rch.point(lambda v: 0), gch.point(lambda v: 0), bch, ach.point(lambda v: v // 3)))
            base = Image.new("RGBA", img.size, (0, 0, 0, 0))
            base.alpha_composite(red, (-off, 0))
            base.alpha_composite(blu, (off, 0))
            base.alpha_composite(img)
            img = base
        glow = img.filter(ImageFilter.GaussianBlur(14 * S))
        img = Image.alpha_composite(glow, img)
    # white burst: rises over the last 0.12 s before the cut, clears over POST
    if t > -0.12:
        a = (t + 0.12) / 0.12 if t < 0 else max(0.0, 1 - t / POST) ** 1.5
        a = max(0.0, min(1.0, a))
        white = Image.new("RGBA", img.size, (255, 250, 245, int(255 * a)))
        img = Image.alpha_composite(img, white)
    img = img.resize((W, H), Image.LANCZOS)
    if PLATE[0] <= t < PLATE[1]:
        img = Image.alpha_composite(img, plate(dest, int((t - PLATE[0]) * 12)))
    return img


def main():
    ev = json.load(open(ROOT / f"audio/{reel}-events.json"))
    jumps = [e for e in ev["events"] if e["kind"] == "jump"]
    out_dir = ROOT / f"renders/{reel}/jumps"
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = []
    n = int((PRE + max(POST, PLATE[1])) * FPS)
    for i, j in enumerate(jumps):
        f = out_dir / f"jump-{i}.mov"
        enc = subprocess.Popen([FF, "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}",
                                "-r", str(FPS), "-i", "-", "-c:v", "qtrle", "-pix_fmt", "argb", str(f)], stdin=subprocess.PIPE)
        for k in range(n):
            enc.stdin.write(frame(k, n, i, j["to"]).tobytes())
        enc.stdin.close()
        enc.wait()
        meta.append({"t0": round(j["t"] - PRE, 3), "t": j["t"], "file": str(f)})
        print(f"jump {i}: {j['from']} -> {j['to']} at {j['t']:.2f}s")
    json.dump(meta, open(out_dir / "jumps.json", "w"), indent=1)


if __name__ == "__main__":
    main()
