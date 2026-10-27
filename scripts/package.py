"""Package an approved reel for posting (Ian posts it himself; nothing here publishes anything).

usage: python3 package.py <reel-id>
reads  scripts/<id>-lines.json (title, repo, word), scripts/<id>-*.md (## Caption section), renders/<id>/<id> <title>.mp4
writes renders/<id>/POST.md and a row in renders/BATCH.md
"""
import datetime, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
reel = sys.argv[1] if len(sys.argv) > 1 else "01"
meta = json.load(open(ROOT / f"scripts/{reel}-lines.json"))
title, repo, word = meta.get("title", f"Reel {reel}"), meta.get("repo", ""), meta.get("word", "")
script = next(p for p in sorted((ROOT / "scripts").glob(f"{reel}-*.md")) if ".v" not in p.name)
m = re.search(r"^## Caption\s*\n(.*?)(?=^## |\Z)", script.read_text(), re.S | re.M)
caption = m.group(1).strip() if m else "(no caption section in the script)"
video = ROOT / f"renders/{reel}/{reel} {title}.mp4"

post = f"""# Reel {reel}: {title}

**Upload:** `{video}`
**Keyword:** {word}
**Repo (the DM sends this):** {repo}

## Caption
{caption}

## ManyChat rule (set up once per keyword; see manychat/SETUP.md)
- Trigger: a comment on this reel that contains **{word}** (any case).
- Public reply: "Sent! Check your DMs."
- DM: "Here's the repo, free and open source: {repo}. Star it if it helps."

## Before posting
- [ ] Watched once with sound
- [ ] Cover frame chosen (the first universe jump reads well as a cover)
- [ ] ManyChat rule live for {word}
"""
(ROOT / f"renders/{reel}/POST.md").write_text(post)
batch = ROOT / "renders/BATCH.md"
if not batch.exists():
    batch.write_text("# Reel batch\n\n| Reel | Title | Keyword | Repo | Packaged | Posted |\n|---|---|---|---|---|---|\n")
rows = batch.read_text()
if f"| {reel} |" not in rows:
    batch.write_text(rows + f"| {reel} | {title} | {word} | {repo} | {datetime.date.today()} | no |\n")
print(f"renders/{reel}/POST.md")
