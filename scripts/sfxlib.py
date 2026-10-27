"""Fetch the shared library of real recorded sound effects (CC0 only) from the Openverse API: no key, no account.

usage: python3 sfxlib.py [--refresh]   # fills audio/sfxlib/<kind>_<k>.wav (up to VARIANTS per kind) + CREDITS.json
API: https://api.openverse.org/v1/audio/?q=SOUND&license=cc0 (Ian's pick, 2026-10-26). We also pin source=freesound,
because the other providers return spoken words and songs for effect queries (a "rubber stamp" hit was a pronunciation file).
Every sound effect in a reel comes from this library first; sound.py synthesizes one only when a kind has no file.
The API answers 500 now and then: each query retries, then tries the next phrasing.
"""
import os, json, re, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FF = os.environ.get("FFMPEG", "ffmpeg")
LIB = ROOT / "audio/sfxlib"
LIB.mkdir(parents=True, exist_ok=True)
VARIANTS = 3

# kind -> (query phrasings in order, min seconds, max seconds). Kinds match sound.py.
WANT = {
    "typing": (["keyboard typing", "typing keyboard", "mechanical keyboard"], 1.0, 10),
    "whoosh": (["whoosh", "swoosh", "swish"], 0.15, 2),
    "impact": (["cinematic impact", "impact boom", "deep impact"], 0.5, 5),
    "riser": (["riser", "rising sweep", "uplifter"], 0.8, 6),
    "glitch": (["glitch", "digital glitch", "data glitch"], 0.1, 2),
    "notify": (["notification", "message notification", "notification ping"], 0.1, 2),
    "click": (["mouse click", "button click", "ui click"], 0.03, 1),
    "shutter": (["camera shutter", "shutter click"], 0.1, 2),
    "coin": (["coin pickup", "8 bit coin", "coin"], 0.1, 2),
    "stamp": (["stamp hit", "rubber stamp", "stamping paper"], 0.1, 2),
    "beep": (["error beep", "warning beep", "alarm beep"], 0.1, 3),
    "ding": (["bell ding", "ding", "chime"], 0.2, 3),
    "pop": (["pop", "bubble pop", "cork pop"], 0.05, 1),
    "buzzer": (["buzzer wrong", "wrong answer buzzer", "buzzer"], 0.2, 2),
    "paper": (["paper swipe", "paper slide", "paper"], 0.1, 2),
    "success": (["success chime", "level up", "achievement"], 0.3, 3),
}
BAD = re.compile(r"pronunc|LL-Q|speech|voice|vocal|song|music|loop|ambien|podcast", re.I)
UA = {"User-Agent": "omega-reels/1.0 (personal reel pipeline)"}


LIMITED = {"hits": 0}  # 429s seen this run; after 2 we stop asking and keep what we have


def search(q):
    if LIMITED["hits"] >= 2:
        return []
    url = "https://api.openverse.org/v1/audio/?" + urllib.parse.urlencode(
        {"q": q, "license": "cc0", "source": "freesound", "page_size": 30})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
                return json.load(r)["results"]
        except urllib.error.HTTPError as e:
            if e.code == 429:  # anonymous throttle: one short wait, then give up for this run (builds must not hang)
                LIMITED["hits"] += 1
                if LIMITED["hits"] >= 2:
                    print("  Openverse rate limit: keeping the current library, will top up on a later run")
                    return []
                time.sleep(min(20, int(e.headers.get("Retry-After") or 20)))
            else:
                time.sleep(3 + attempt * 3)
        except Exception:
            time.sleep(3 + attempt * 3)
    return []


def fetch(hit, out):
    raw = out.with_suffix(".src")
    try:
        with urllib.request.urlopen(urllib.request.Request(hit["url"], headers=UA), timeout=30) as r:
            raw.write_bytes(r.read())
        # trim leading silence, cap at 10 s, mono 48 kHz
        subprocess.run([FF, "-loglevel", "error", "-y", "-i", str(raw), "-t", "10", "-ac", "1", "-ar", "48000",
                        "-af", "silenceremove=start_periods=1:start_threshold=-45dB", str(out)], check=True)
        return True
    except Exception as e:
        print(f"  download failed: {e}")
        return False
    finally:
        raw.unlink(missing_ok=True)


def main():
    refresh = "--refresh" in sys.argv
    credits_p = LIB / "CREDITS.json"
    credits = json.load(open(credits_p)) if credits_p.exists() else {}
    for old in LIB.glob("*.wav"):  # one-time move from the single-file layout (kind.wav -> kind_1.wav)
        if "_" not in old.stem:
            old.rename(LIB / f"{old.stem}_1.wav")
            if old.stem in credits:
                credits[f"{old.stem}_1"] = credits.pop(old.stem)
    for kind, (queries, lo, hi) in WANT.items():
        have = sorted(LIB.glob(f"{kind}_*.wav"))
        if len(have) >= VARIANTS and not refresh:
            continue
        used = {credits.get(p.stem, {}).get("foreign_landing_url") for p in have}
        k = len(have) + 1
        for q in queries:
            if k > VARIANTS:
                break
            for r in search(q):
                if k > VARIANTS:
                    break
                d = (r.get("duration") or 0) / 1000
                title = r.get("title") or ""
                if r.get("license") != "cc0" or not r.get("url") or not (lo <= d <= hi) or BAD.search(title):
                    continue
                if r.get("foreign_landing_url") in used:
                    continue
                out = LIB / f"{kind}_{k}.wav"
                if fetch(r, out):
                    credits[out.stem] = {x: r.get(x) for x in ("title", "creator", "foreign_landing_url", "license", "license_url", "provider")}
                    used.add(r.get("foreign_landing_url"))
                    print(f"✓ {out.stem}: {title} by {r.get('creator')} (CC0)")
                    json.dump(credits, open(credits_p, "w"), indent=1)
                    k += 1
            time.sleep(4)  # stay under the anonymous rate limit
        if k == 1:
            print(f"✗ {kind}: nothing CC0 found; sound.py will synthesize it")


if __name__ == "__main__":
    main()
