"""Assemble the dialogue track for a reel and write per-line timings.

usage: python3 build_audio.py <reel-id>   (e.g. 01)
reads  scripts/<id>-lines.json, audio/<id>/lines/NN.wav  (writes processed lines to audio/<id>/proc/)
writes audio/<id>-dialogue.wav, audio/<id>-timings.json
"""
import os, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FF = os.environ.get("FFMPEG", "ffmpeg")
reel = sys.argv[1] if len(sys.argv) > 1 else "01"
meta = json.load(open(ROOT / f"scripts/{reel}-lines.json"))
lines = meta["lines"] if isinstance(meta, dict) else meta
meta = meta if isinstance(meta, dict) else {}
# Per reel, in scripts/<id>-lines.json: "skip" = lines cut in the edit (still voiced, kept on disk);
# "beats" = extra pause in seconds BEFORE a line, for comic timing (default gap 0.1 s).
SKIP = set(meta.get("skip", []))
BEAT_BEFORE = {int(k): v for k, v in meta.get("beats", {}).items()}
src, tmp = ROOT / f"audio/{reel}/lines", ROOT / f"audio/{reel}/proc"
tmp.mkdir(parents=True, exist_ok=True)

# Per-line overrides for TTS glitches: trim start / hard end (seconds of the raw file).
TRIM_START = {}
TRIM_END = {}
OPEN_PAD, END_PAD = 0.3, 0.4
# v2 ElevenLabs voices: keep Ian natural, nudge Omega a little faster.
TEMPO = {"OMEGA": 1.2, "IAN": 1.08}

# Tighten long internal pauses, normalize. Omega gets only a touch of presence (v1 comb read as robotic).
SQUEEZE = ("silenceremove=start_periods=1:start_threshold=-38dB:"
           "stop_periods=-1:stop_duration=0.2:stop_threshold=-40dB:stop_silence=0.14")
OMEGA_FX = "highpass=f=90,treble=g=1.5"
COMMON = "loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000"


def dur(p):
    out = subprocess.run([FF, "-i", str(p)], capture_output=True, text=True).stderr
    h, m, s = out.split("Duration: ")[1].split(",")[0].split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


timings, parts, t = [], [], OPEN_PAD
for ln in lines:
    n = ln["n"]
    if n in SKIP:
        continue
    out = tmp / f"{n:02d}.wav"
    chain = [SQUEEZE, f"atempo={TEMPO[ln['who']]}"]
    if ln["who"] == "OMEGA":
        chain.append(OMEGA_FX)
    chain += [COMMON, "areverse", SQUEEZE.replace("stop_periods=-1", "stop_periods=0"), "areverse"]
    # -ss/-t go before -i so they cut the raw file, not the tempo-shifted output.
    cmd = [FF, "-loglevel", "error", "-y"]
    if n in TRIM_START:
        cmd += ["-ss", str(TRIM_START[n])]
    if n in TRIM_END:
        cmd += ["-t", str(TRIM_END[n] - TRIM_START.get(n, 0))]
    cmd += ["-i", str(src / f"{n:02d}.wav")]
    subprocess.run(cmd + ["-af", ",".join(chain), "-ac", "1", str(out)], check=True)
    t += BEAT_BEFORE.get(n, 0.1)
    d = dur(out)
    timings.append({"n": n, "who": ln["who"], "text": ln["text"], "start": round(t, 3), "end": round(t + d, 3)})
    parts.append((out, t))
    t += d

total = t + END_PAD
inputs, delays = [], []
for i, (p, start) in enumerate(parts):
    inputs += ["-i", str(p)]
    ms = int(start * 1000)
    delays.append(f"[{i}]adelay={ms}|{ms}[a{i}]")
mix = ";".join(delays) + ";" + "".join(f"[a{i}]" for i in range(len(parts))) + \
    f"amix=inputs={len(parts)}:normalize=0,apad=whole_dur={total}[out]"
subprocess.run([FF, "-loglevel", "error", "-y", *inputs, "-filter_complex", mix, "-map", "[out]",
                "-ac", "2", "-ar", "48000", str(ROOT / f"audio/{reel}-dialogue.wav")], check=True)
json.dump({"total": round(total, 3), "lines": timings}, open(ROOT / f"audio/{reel}-timings.json", "w"), indent=1)
print(f"total {total:.2f}s")
for x in timings:
    print(f'{x["n"]:>2} {x["who"]:<5} {x["start"]:6.2f}-{x["end"]:6.2f}  {x["text"]}')
