"""Score and sound-design a reel from its event map: an original music bed per universe plus frame-exact effects.

usage: python3 scripts/sound.py <reel-id>      (needs numpy + scipy)
reads  audio/<id>-events.json, audio/sfxlib/*.wav (real CC0 recordings from sfxlib.py, optional)
writes audio/<id>-music.wav (score, un-ducked: compose.py ducks it under the dialogue), audio/<id>-sfx.wav

Score: 90 BPM in A minor (Am F C G, two bars each), one arrangement per universe so every jump also changes the music:
  holo = soft detuned pads + sub pulse   crt = 25% pulse-wave arpeggio + pads
  arcade = chiptune (square lead, triangle bass, noise snare)   neon = synthwave (pumping saw bass, gated snare, bright pad)
Effects: jump = riser into impact + glitch tail; card = whoosh; phase hits per events.py; a soft blip when Omega speaks.
Every effect is a real CC0 recording from the Openverse library (sfxlib.py), rotating variants; scripts/vendor/sfx.py (from lemo-opuscar, MIT) synthesizes one only when a kind has no recording.
"""
import os, json, subprocess, sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent / "vendor"))
import sfx  # noqa: E402  (vendored lemo-opuscar procedural foley, MIT)
from sfx import SR, add, bp, env_exp, hp, lp, noise, norm, t_  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FF = os.environ.get("FFMPEG", "ffmpeg")
reel = sys.argv[1] if len(sys.argv) > 1 else "01"
BPM = 90
BEAT = 60 / BPM
BAR = 4 * BEAT
# A minor: Am F C G (root MIDI notes, chord tones as semitone offsets)
PROG = [(57, (0, 3, 7)), (53, (0, 4, 7)), (60, (0, 4, 7)), (55, (0, 4, 7))]
rng = np.random.default_rng(11)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def osc(kind, f, d, duty=0.5):
    tt = t_(d)
    ph = (tt * f) % 1
    if kind == "saw":
        return 2 * ph - 1
    if kind == "square":
        return np.where(ph < duty, 1.0, -1.0)
    if kind == "tri":
        return 4 * np.abs(ph - 0.5) - 1
    return np.sin(2 * np.pi * f * tt)


def adsr(d, a=0.01, r=0.1):
    n = int(round(d * SR))
    e = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def note(kind, m, d, v=1.0, duty=0.5, a=0.01, r=0.1, detune=0.0):
    x = osc(kind, hz(m) * (1 + detune), d, duty)
    if detune:
        x = 0.5 * (x + osc(kind, hz(m) * (1 - detune), d, duty))
    return x * adsr(d, a, r) * v


def kick(v=1.0):
    d = 0.32
    tt = t_(d)
    f = 50 + 90 * np.exp(-tt / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, 0.09) * v


def snare(v=1.0, d=0.18):
    return (hp(noise(d), 1500) * env_exp(d, 0.05) + np.sin(2 * np.pi * 190 * t_(d)) * env_exp(d, 0.03) * 0.4) * v


def hat(v=1.0):
    d = 0.05
    return hp(noise(d), 7000) * env_exp(d, 0.012) * v


def chord_at(t):
    i = int(t // (2 * BAR)) % len(PROG)
    return PROG[i]


def piano(m, d, v):
    """Honky-tonk upright: two slightly detuned partial stacks with a hammer-fast attack and exponential decay."""
    tt = t_(d)
    x = sum(np.sin(2 * np.pi * hz(m) * h * (1 + det) * tt) / h ** 1.6 for h in (1, 2, 3, 4) for det in (0, .006))
    return x * env_exp(d, .22) * adsr(d, .002, .05) * v * .35


def score_section(buf, t0, t1, u):
    """Write one universe's arrangement into buf between t0 and t1 (seconds), on the global beat grid."""
    k0 = int(np.ceil(t0 / (BEAT / 4)))
    k1 = int(t1 / (BEAT / 4))
    for k in range(k0, k1):           # 16th-note grid
        t = k * BEAT / 4
        step = k % 16                 # position in the bar
        root, tones = chord_at(t)
        if u == "silent":   # 1927: ragtime stride piano (bass on 1 and 3, chord stabs on 2 and 4, a swung melody) + projector clatter
            if step in (0, 8):
                add(buf, piano(root - 12 + (7 if step == 8 else 0), BEAT * .9, 1.0), t, pan=-.1)
            if step in (4, 12):
                for o in tones:
                    add(buf, piano(root + 12 + o, BEAT * .5, .45), t, pan=.1)
            if step % 2 == 0 and step not in (6, 14):
                mel = root + 24 + tones[(step // 2 + (k // 16)) % 3] + (12 if step == 10 else 0)
                add(buf, piano(mel, BEAT * .45, .55), t + (BEAT / 4 * .33 if step % 4 == 2 else 0), pan=.2)
            add(buf, bp(noise(.02), 1800, 5000) * env_exp(.02, .004) * .12, t, pan=.4)
            continue
        if u == "vhs":      # 1987: the neon synthwave arrangement plus tape hiss
            if step == 0:
                add(buf, hp(noise(BEAT * 4), 4000) * .015, t, pan=0)
            u = "neon"
        if step == 0 and (k // 16) % 2 == 0:   # pads: one chord per two bars
            d = min(2 * BAR, t1 - t)
            if d > 0.2:
                kind, v, cut = {"holo": ("saw", .09, 1400), "crt": ("saw", .07, 1100),
                                "arcade": ("square", .035, 2400), "neon": ("saw", .1, 2600)}[u]
                pad = sum(note(kind, root + 12 + o, d, v, a=.4, r=.6, detune=.004) for o in tones)
                add(buf, lp(pad, cut), t, 1.0, 0)
        if u == "holo":
            if step % 4 == 0:
                add(buf, note("sine", root - 12, BEAT * .9, .32, a=.005, r=.2), t)
            if step % 4 == 2:
                add(buf, hat(.05), t, pan=.3)
        elif u == "crt":
            arp = [tones[(step // 2) % 3] + 12 * ((step // 6) % 2)]
            if step % 2 == 0:
                add(buf, lp(note("square", root + 12 + arp[0], BEAT / 2 * .9, .07, duty=.25, r=.05), 3200), t, pan=-.2)
            if step % 8 == 0:
                add(buf, note("sine", root - 12, BEAT * 1.8, .3, r=.3), t)
            if step in (4, 12):
                add(buf, hat(.06), t, pan=.25)
        elif u == "arcade":
            add(buf, note("square", root + 24 + tones[step % 3], BEAT / 4 * .8, .05, duty=.5, r=.02), t, pan=.15)
            if step % 2 == 0:
                add(buf, note("tri", root - 12 + (7 if step % 8 == 4 else 0), BEAT / 2 * .9, .22, r=.03), t)
            if step in (4, 12):
                add(buf, lp(noise(.12), 6000) * env_exp(.12, .03) * .18, t)
            if step in (0, 8):
                add(buf, kick(.35), t)
        elif u == "neon":
            if step % 2 == 0:   # 8th-note saw bass with sidechain pump
                pump = .45 + .55 * min(1, (step % 4) / 2)
                add(buf, lp(note("saw", root - 12, BEAT / 2 * .95, .2 * pump, r=.04), 700), t)
            if step % 4 == 0:
                add(buf, kick(.5), t)
            if step in (4, 12):
                add(buf, snare(.22, .3), t, pan=0)
            if step % 2 == 1:
                add(buf, hat(.05), t, pan=.35)
            if step % 3 == 0:
                add(buf, note("square", root + 24 + tones[(step // 3) % 3], .12, .025, duty=.3, r=.06), t, pan=-.4)


def load_variants(kind):
    """Every CC0 recording of one kind from audio/sfxlib (sfxlib.py, Openverse), normalized."""
    out = []
    for p in sorted((ROOT / "audio/sfxlib").glob(f"{kind}_*.wav")):
        raw = subprocess.run([FF, "-v", "quiet", "-i", str(p), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                             capture_output=True).stdout
        x = np.frombuffer(raw, np.float32).astype(np.float64)
        if len(x):
            out.append(norm(x))
    return out


class Lib:
    """Real recordings first: lib.get(kind) rotates through a kind's variants so repeats don't sound copied."""
    def __init__(self, kinds):
        self.v = {k: load_variants(k) for k in kinds}
        self.n = {k: 0 for k in kinds}

    def get(self, kind, max_s=None):
        vs = self.v.get(kind) or []
        if not vs:
            return None
        x = vs[self.n[kind] % len(vs)]
        self.n[kind] += 1
        if max_s and len(x) > max_s * SR:
            x = x[: int(max_s * SR)].copy()
            f = min(len(x), int(.08 * SR))
            x[-f:] *= np.linspace(1, 0, f)
        return x


def riser(d=0.5):
    tt = t_(d)
    n = noise(d)
    out = np.zeros_like(n)
    for i in range(0, len(n), 480):
        hi = min(len(n), i + 480)
        f = 400 + 5000 * (i / len(n)) ** 2
        out[i:hi] = bp(n[max(0, i - 2000):hi], f * .8, f * 1.25)[-(hi - i):]
    return norm(out * (tt / d) ** 2)


def beeps(n=3, f=1650, gap=.16, v=1.0):
    out = np.zeros(int((n * gap + .1) * SR))
    for i in range(n):
        b = note("square", 0, .09, 1, duty=.5, r=.01)
        b = np.sin(2 * np.pi * f * t_(.09)) * adsr(.09, .002, .02)
        s = int(i * gap * SR)
        out[s:s + len(b)] += b
    return out * v


def main():
    ev = json.load(open(ROOT / f"audio/{reel}-events.json"))
    dur = ev["duration"]
    n = int((dur + 1) * SR)
    music = np.zeros((n, 2))
    fx = np.zeros((n, 2))
    lib = Lib(["typing", "whoosh", "impact", "riser", "glitch", "notify", "click", "shutter", "coin", "stamp", "beep",
               "ding", "pop", "buzzer", "paper", "success"])
    either = lambda kind, synth, max_s=None: (lambda x: x if x is not None else synth())(lib.get(kind, max_s))

    for s in ev["sections"]:
        score_section(music, s["t0"], s["t1"], s["universe"])
    # music starts on a hit and ends with a tail
    music[: int(.05 * SR)] *= np.linspace(0, 1, int(.05 * SR))[:, None]

    for e in ev["events"]:
        t, k = e["t"], e["kind"]
        if k == "jump":
            r = either("riser", lambda: riser(.5))
            r = r[-int(.6 * SR):]
            add(fx, r, t - len(r) / SR, .35)
            add(fx, sfx.thump(1, 55), t, .7)
            add(fx, either("impact", lambda: sfx.crash(.5), 1.6), t, .55)
            add(fx, either("glitch", lambda: hp(noise(.2), 2000) * env_exp(.2, .05), .4), t + .05, .35, -.3)
            add(fx, either("glitch", lambda: hp(noise(.2), 2000) * env_exp(.2, .05), .4), t + .17, .25, .3)
            # the score drops out under the riser so the jump lands in a hole
            a, b = int((t - .45) * SR), int(t * SR)
            if a > 0:
                music[a:b] *= np.linspace(1, .15, b - a)[:, None]
        elif k == "card":
            add(fx, either("whoosh", lambda: sfx.whoosh(.35), .8), t - .08, .45, .2)
        elif k == "line" and e["who"] == "OMEGA":
            add(fx, np.sin(2 * np.pi * 2400 * t_(.05)) * adsr(.05, .002, .03), t - .06, .05, .4)
        elif k == "sfx":
            name, d = e["name"], e.get("dur", 1.0)
            if name == "typing":
                add(fx, either("typing", lambda: sum(np.pad(sfx.step(.5), (int(i / 12 * SR), 0))[: int(2 * SR)] for i in range(20)), min(d, 2.2)), t + .15, .3, -.15)
            elif name == "stamp":
                add(fx, either("stamp", lambda: sfx.thump(1, 85), 1.0), t + .35, .7)
            elif name == "notify":
                add(fx, either("notify", lambda: sfx.ding(.6), 1.2), t + .1, .35)
            elif name == "marker":
                add(fx, either("paper", lambda: bp(noise(.35), 2500, 5000) * np.sin(np.pi * t_(.35) / .35), .6), t + .3, .25)
            elif name == "strike":
                add(fx, either("whoosh", lambda: sfx.whoosh(.18), .5), t + .4, .3)
            elif name == "card":
                add(fx, either("paper", lambda: sfx.whoosh(.3), .6), t + .1, .35)
                add(fx, either("stamp", lambda: sfx.thump(.6, 90), .8), t + .45, .45)
            elif name == "alarm":
                add(fx, either("beep", lambda: beeps(3, 1650, .17), 1.2), t + .15, .25)
            elif name == "success":
                add(fx, either("success", lambda: sfx.ding(.8), 1.6), t + .05, .35)
                add(fx, either("coin", lambda: sfx.ding(.5), .8), t + .3, .25)
            elif name == "click":
                add(fx, either("click", lambda: sfx.step(1), .5), t + .1, .5)
            elif name == "deny":
                add(fx, either("buzzer", lambda: lp(osc("square", 110, .35), 900) * adsr(.35, .005, .05), .8), t + .5, .25)
            elif name == "cta":
                add(fx, either("ding", lambda: sfx.ding(.7), 1.5), t + .1, .3)
                add(fx, either("shutter", lambda: sfx.pop(1), .6), t + .6, .3)
            elif name == "ding":
                add(fx, either("ding", lambda: sfx.ding(.7), 1.5), t, .25)
            elif name == "pop":
                add(fx, either("pop", lambda: sfx.pop(1), .4), t, .3)

    # tail: let the last chord ring
    end = int(dur * SR)
    fade = int(1.2 * SR)
    music[end - fade:end] *= np.linspace(1, 0, fade)[:, None]
    music[end:] = 0
    for buf, name in ((music, "music"), (fx, "sfx")):
        buf = buf[: end + int(.2 * SR)]
        peak = np.abs(buf).max() or 1
        buf = buf / peak * .89
        subprocess.run([FF, "-loglevel", "error", "-y", "-f", "f64le", "-ar", str(SR), "-ac", "2", "-i", "-",
                        "-c:a", "pcm_s16le", str(ROOT / f"audio/{reel}-{name}.wav")], input=buf.astype(np.float64).tobytes(), check=True)
    print(f"music + sfx written ({dur:.1f}s)")


if __name__ == "__main__":
    main()
