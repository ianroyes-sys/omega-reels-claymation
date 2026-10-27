"""Compose a finished 1080x1920 reel.

usage: python3 compose.py <reel-id>
needs  audio/<id>-timings.json, audio/<id>-dialogue.wav, renders/<id>/shots/NN.mp4,
       ui/top.mp4 (1080x900 UI track rendered from the same timings)
optional audio/<id>-events.json (universe grades, RGB split), renders/<id>/jumps/ (multiverse.py),
       audio/<id>-music.wav + audio/<id>-sfx.wav (sound.py): music is ducked under the dialogue, master -14 LUFS
writes renders/<id>/<id>-final.mp4
"""
import os, json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FF = os.environ.get("FFMPEG", "ffmpeg")
reel = sys.argv[1] if len(sys.argv) > 1 else "01"
OUT = ROOT / f"renders/{reel}"
SEG = OUT / "segs"
SEG.mkdir(parents=True, exist_ok=True)

W, H, UI_H = 1080, 1920, 900
SCENE_H = H - UI_H                  # 1020
SRC_W = round(1112 * SCENE_H / 834)  # scaled 4:3 source width (1360)
ENDCARD = 2.0
BG = "0x0E0B16"
# Horizontal crop offset per shot type, so the speaker sits in frame.
SHOT_OF = {}
OFFSET = {"IAN": 280, "OMEGA": 0, "WIDE": 140}
CAPTION_Y = 955
COLORS = {"IAN": "&H00FFFFFF", "OMEGA": "&H00E8F03E"}  # ASS is BGR: Omega cyan #3EF0E8

# Clay Multiverse grade (STYLE: docs/clay-multiverse-style.md). Base = neon clay night (OPUSCAR 98 #97 Anora, #78 Crash):
# blue-violet shadows, warm sodium highlights, bloom, vignette, moving grain. Each universe adds its own turn.
GRADE = {
    "holo": "eq=contrast=1.06:saturation=1.08,colorbalance=rs=-.03:bs=.08:rh=.03:bh=-.02:bm=.03",
    "crt": "eq=contrast=1.08:saturation=.9,colorchannelmixer=rr=1.0:rg=.12:gg=.86:gb=.04:bb=.62",
    "arcade": ("scale=iw/10:ih/10:flags=neighbor,lutrgb=r='floor(val/51)*51':g='floor(val/51)*51':b='floor(val/64)*64',"
               "scale=iw*10:ih*10:flags=neighbor,eq=contrast=1.15:saturation=1.6"),
    "neon": "eq=contrast=1.1:saturation=1.28,colorbalance=rs=.07:bs=.11:rh=.05:bh=.02",
    # reel 02 v2 (Ian: "make the universes more drastic"): 1927 silent film and a 1987 VHS tape
    "silent": "eq=contrast=1.3:brightness=.02",
    "vhs": "eq=contrast=1.05:saturation=1.45,colorbalance=rs=.06:bs=-.04:rh=.04,gblur=sigma=1.2",
}
# Whole-frame looks (card + clay) for the drastic universes, applied over the composite before captions.
# Each entry is a list of timeline-capable filters; compose adds enable='between(t,t0,t1)' to every one.
SEPIA = "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131"
FRAME_FX = {
    "silent": ["hue=s=0", SEPIA, "eq=contrast=1.25:brightness='0.045*sin(t*41)*sin(t*13)':eval=frame",
               "noise=alls=34:allf=t+u", "vignette=angle=PI/3.1",
               "drawbox=x='mod(floor(t*12)*397,1080)':y=0:w=3:h=ih:color=0xF4ECD8@0.55:t=fill",
               "drawbox=x='mod(floor(t*12)*613+211,1080)':y=0:w=2:h=ih:color=0x1A140C@0.6:t=fill",
               "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.9:t=34"],
    "vhs": ["rgbashift=rh=7:bh=-7:gv=2", "noise=alls=14:allf=t",
            "drawbox=x=0:y='mod(t*340,1920)':w=iw:h=26:color=white@0.16:t=fill",
            "drawbox=x=0:y='mod(t*340+90,1920)':w=iw:h=6:color=black@0.35:t=fill",
            "drawbox=x=0:y=1878:w=iw:h=42:color=black@0.5:t=fill"],
}
FINISH = ("split[g0][g1];[g1]gblur=sigma=22[g2];[g0][g2]blend=all_mode=screen:all_opacity=.22,"
          "vignette=PI/5,noise=alls=6:allf=t")
events_p = ROOT / f"audio/{reel}-events.json"
SECTIONS = json.load(open(events_p))["sections"] if events_p.exists() else [{"t0": 0, "t1": 1e9, "universe": "holo"}]
JUMPS = [e["t"] for e in json.load(open(events_p))["events"] if e["kind"] == "jump"] if events_p.exists() else []


def universe_at(t):
    u = SECTIONS[0]["universe"]
    for sec in SECTIONS:
        if t + 1e-3 >= sec["t0"]:
            u = sec["universe"]
    return u

timing = json.load(open(ROOT / f"audio/{reel}-timings.json"))
lines, total = timing["lines"], timing["total"]
# scripts/<id>-plan.json: Ian lines are Seedance clips, Omega lines (and reactions) come from omega_face.py.
plan = json.load(open(ROOT / f"scripts/{reel}-plan.json"))
for k, p in plan.items():
    SHOT_OF[int(k)] = "IAN" if p["src"] == "ian" else ("WIDE" if p["key"] == "wide" else "OMEGA")

def run(cmd):
    subprocess.run([FF, "-loglevel", "error", "-y", *cmd], check=True)

# 1. Scene track: one segment per line, from its start to the next line's start.
end_all = total + ENDCARD
seg_files = []
for i, ln in enumerate(lines):
    n = ln["n"]
    t0 = 0.0 if i == 0 else ln["start"]
    t1 = lines[i + 1]["start"] if i + 1 < len(lines) else end_all
    lead = ln["start"] - t0  # first segment holds frame 0 until speech starts
    off = OFFSET[SHOT_OF[n]]
    vf = (f"tpad=start_mode=clone:start_duration={lead:.3f}:stop_mode=clone:stop_duration=20,"
          f"scale={SRC_W}:{SCENE_H},crop={W}:{SCENE_H}:{off}:0,"
          f"fps=12,{GRADE[universe_at(ln['start'])]},{FINISH},fps=30,format=yuv420p")  # hold on twos: stop-motion cadence
    f = SEG / f"{n:02d}.mp4"
    run(["-i", str(OUT / f"shots/{n:02d}.mp4"), "-t", f"{t1 - t0:.3f}", "-vf", vf, "-an",
         "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", str(f)])
    seg_files.append(f)
lst = SEG / "list.txt"
lst.write_text("".join(f"file '{p}'\n" for p in seg_files))
scene = OUT / "scene.mp4"
run(["-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(scene)])

# 2. Captions: 1-3 word chunks spread across each line by character weight.
def ts(t):
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"

ass = [
    "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, "
    "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV",
    "Style: Cap,Avenir Next,64,&H00FFFFFF,&H00230B1E,&H96000000,1,0,1,4,0,5,60,60,0", "",
    "[Events]", "Format: Layer, Start, End, Style, Text",
]
for ln in lines:
    # Delivery tags like [dry] are for the voice engine, not the captions.
    words = re.sub(r"\[[^\]]*\]\s*", "", ln["text"]).replace('"', "").split()
    chunks, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) == 3 or w[-1] in ".?!,":
            chunks.append(" ".join(cur)); cur = []
    if cur:
        chunks.append(" ".join(cur))
    weights = [len(c) + 4 for c in chunks]
    t, span = ln["start"], ln["end"] - ln["start"]
    for c, wgt in zip(chunks, weights):
        d = span * wgt / sum(weights)
        ass.append(f"Dialogue: 0,{ts(t)},{ts(t + d)},Cap,"
                   f"{{\\pos({W // 2},{CAPTION_Y})\\c{COLORS[ln['who']]}\\be2\\fscx88\\fscy88\\t(0,80,\\fscx100\\fscy100)}}{c.upper()}")
        t += d
cap = OUT / "captions.ass"
cap.write_text("\n".join(ass) + "\n")

# 3. Final composite: bg + scene + soft seam + UI track + captions; dialogue (+ music bed).
grad = OUT / "seam.png"
run(["-f", "lavfi", "-i", f"color=c={BG}:s={W}x160,format=rgba",
     "-vf", "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*pow(1-Y/159,1.6)'", "-frames:v", "1", str(grad)])
ui = ROOT / "ui/top.mp4"
music = ROOT / f"audio/{reel}-music.wav"
inputs = ["-f", "lavfi", "-i", f"color=c={BG}:s={W}x{H}:r=30:d={end_all:.3f}",
          "-i", str(scene), "-i", str(ui), "-loop", "1", "-i", str(grad),
          "-i", str(ROOT / f"audio/{reel}-dialogue.wav")]
fc = (f"[0][1]overlay=0:{UI_H}:shortest=1[a];"
      f"[1]trim=0:0.001,null[dummy];"  # keeps filter graph happy if scene shorter
      f"[a][3]overlay=0:{UI_H}:shortest=1[b];"
      f"[2]tpad=stop_mode=clone:stop_duration=10[ui];"
      f"[b][ui]overlay=0:0:shortest=1[c];"
      f"[c]drawbox=x=0:y={UI_H}:w={W}:h={SCENE_H}:color=black@0.55:t=fill:enable='gte(t,{total:.3f})'[d];"
      f"[d]{{FX}}subtitles='{cap}'[v]")
fx = []
for sec in SECTIONS:
    for flt in FRAME_FX.get(sec["universe"], []):
        fx.append(f"{flt}:enable='between(t,{sec['t0']:.3f},{min(sec['t1'] or 1e9, end_all):.3f})'")
fc = fc.replace("{FX}", ",".join(fx) + "," if fx else "")
fc = fc.replace("[1]trim=0:0.001,null[dummy];", "")
sfx_p = ROOT / f"audio/{reel}-sfx.wav"
jumps_meta = OUT / "jumps/jumps.json"
nxt = 5
if jumps_meta.exists():
    for j in json.load(open(jumps_meta)):
        inputs += ["-itsoffset", f"{j['t0']:.3f}", "-i", j["file"]]
        fc = fc.replace("[v]", f"[v{nxt}]") + f";[v{nxt}][{nxt}]overlay=0:0:eof_action=pass[v]"
        nxt += 1
# RGB split on the whole frame around each jump (the smear before the ring bursts)
fc = fc[: fc.rindex("[v]")] + "[vj]" + fc[fc.rindex("[v]") + 3:]
split = ",".join(f"rgbashift=rh=-14:bh=14:enable='between(t,{t - .22:.3f},{t + .18:.3f})'" for t in JUMPS) or "null"
fc += f";[vj]{split}[v]"
if music.exists() and sfx_p.exists():
    mi, si = nxt, nxt + 1
    inputs += ["-i", str(music), "-i", str(sfx_p)]
    fc += (f";[4]asplit[d1][dk];[{mi}]volume=0.32[m0];[m0][dk]sidechaincompress=threshold=0.025:ratio=6:attack=15:release=400[md];"
           f"[{si}]volume=0.5[fx];[d1][md][fx]amix=inputs=3:normalize=0:duration=longest,"
           f"afade=t=out:st={end_all - .6:.3f}:d=0.6,loudnorm=I=-14:TP=-1.5:LRA=11[aud]")
    amap = "[aud]"
else:
    amap = "4:a"
final = OUT / f"{reel}-final.mp4"
run([*inputs, "-filter_complex", fc, "-map", "[v]", "-map", amap, "-t", f"{end_all:.3f}",
     "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "30",
     "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final)])
print(final)
