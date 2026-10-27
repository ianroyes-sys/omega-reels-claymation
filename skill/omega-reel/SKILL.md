---
name: omega-reel
description: Make one of Ian's claymation "Ian + Omega" Instagram reels that hypes one of his open-source GitHub repos, in the Clay Multiverse house style (clay cast, code-drawn universe-jumping UI cards, Everything-Everywhere ring jumps, original score and frame-synced sound, about 65 s, ends on "Comment WORD, and I'll send you the repo."). Use when Ian asks for a reel/video for a repo, the next reel in the batch, to redo or re-cut a reel, or when the omega-reel Dagu workflow calls a stage (script, voice, ian, review, package).
---

# Omega reel

Project: this repo, cloned wherever you like (read its `README.md` first). Everything below runs from the repo root.
Rules that bind every reel: `scripts/STYLE.md` (relationship, humour, ~65 s, growth rules, no Gen Z slang, claims only from the README) and `docs/clay-multiverse-style.md` (the look and the sound).
Reel 01 (`opportunity-hunter-engine`, HUNT) is the worked example for every file named here: copy its shape, never its jokes.

**Credits:** Higgsfield credits are scarce. Omega's shots are free (`omega_face.py`); pay only for Ian's on-camera lip-sync shots (Seedance, about 18–23 credits each) and voices (0.3 per line). Budget per reel: ≤ 150 credits. Check `balance` before paying and stop if the reel would go over `MAX_CREDITS` (default 150).
**Never post, publish, comment or DM anywhere.** Ian posts and connects ManyChat himself.

## Stages

Each stage is self-contained, so the workflow can retry one. `NN` is the two-digit reel id.

### script
Inputs: `REPO` (GitHub URL), `WORD` (keyword, one caps noun), `NN`.
1. Read the repo README and top-level files (`gh repo view <repo>`, `gh api repos/<o>/<r>/contents`). Note 3 concrete steps the tool does, its guardrails, requirements, and real numbers. Nothing goes in the script that isn't there.
2. Write `scripts/NN-<repo-slug>.md` in reel 01's shape:
   - the script table: #, who, line, top-half UI card;
   - the caption, in the format STYLE.md gives.
   Structure per STYLE.md:
   - cold open with the viewer and a number in the first 3 s, and the loop opened;
   - "I built you ___. It's free. Watch.";
   - 3 steps;
   - a guardrail beat;
   - a button;
   - Omega's CTA as the last line.
   Aim for 20–24 lines and about 62 s of speech, at roughly 2.6 words per second.
3. Write `scripts/NN-lines.json`, copying `01-lines.json`:
   - `title`, `repo` and `word`;
   - the same `voices` (the ids live in `config/cast.json`; copy them in, or keep the placeholders and resolve them at voice time);
   - `lines` of `{n, who, text}`, with delivery tags in square brackets (`[dry]`, `[sighs]`, `[firmly]`, `[excited]`, `[smug]`, `[softer]`). Omega needs tags: he must never sound flat or monotone.
4. Write `scripts/NN-plan.json`, copying `01-plan.json`:
   - Ian lines on camera are `{"src":"ian"}`. Keep these to **at most 6**, because they cost credits.
   - Every other line is Omega: `{"src":"omega","key":<close-neutral|close-folded|close-present|close-hips|wide>,"expr":[[t,expr]…],"look":0}`.
   - Expressions: flat dry smug explain warm sigh firm skeptic listen.
   - Ian lines heard off-camera play over an Omega reaction shot with `look:-2` and `listen` or `skeptic`.
   - Vary the poses, and use `wide` for the "built you" line and one step.
5. Write the UI:
   - `ui/reels/NN.timeline.json`: copy `01.timeline.json`. One cue per line, with `card`, a `state.phase` per beat and `universes`. Home cards are `holo`; step 1 = `crt`, step 2 = `arcade`, step 3 = `neon`; guardrails go in the last step's universe or `neon`; result and end card are `holo`. Optional `"sfx": {phase: kind}` (kinds are listed in `scripts/events.py`).
   - `ui/reels/NN.js`: copy `01.js`, keep the engine (top ~120 lines and the bottom render/boot), and rewrite `HEAD` and the scene functions for this repo's cards.
   - Every card needs: a real command or file name from the repo, a counter that tracks the story, and something moving about every 0.6 s.
   - The end card shows the keyword.
   Check the UI with stills: `cd ui && node render.mjs reels/NN.timeline.json --stills 1,5,…  --reel NN --outdir /tmp/NN-stills`, then look at every still. Fix any text that overflows or is clipped.

### voice
1. Voice every line with Higgsfield `generate_audio_batch`:
   - params: `model: "text2speech_v2"`, `variant: "elevenlabs"`, `voice_type: "preset"`, `voice_id` from `NN-lines.json`;
   - at most 6 items per batch;
   - then `jobs_wait`.
2. Download each line to `audio/NN/src/NN-<n>.mp3`, convert to `audio/NN/lines/<nn>.wav` (48 kHz mono). In zsh, loop with `bash -c`.
3. Transcribe each line with whisper-cli (`whisper-cli -m <path>/ggml-large-v3-turbo.bin -nt -np` on a 16 kHz copy). Compare with the text minus tags, and re-voice any line that dropped or added words.
4. Run `python3 scripts/build_audio.py NN`. If the total plus 2 s is over 68 s:
   - tighten lines and re-voice them, or add beats to `SKIP` in build_audio.py;
   - **never speed the voices**: TEMPO stays at Omega 1.2 and Ian 1.08.
   `build_audio.py` reads its `SKIP` and `BEAT_BEFORE` for every reel; reset them to fit this reel and note the change in the file.

### ian
1. For each `{"src":"ian"}` line:
   - convert `audio/NN/proc/<nn>.wav` to mp3;
   - upload it with `media_upload`, then `curl -X PUT -H "Content-Type: audio/mpeg" -H "If-None-Match: *" --data-binary @file "<upload_url>"`, then `media_confirm`;
   - save the ids in `audio/NN-media-ids.json`.
2. One `generate_video_batch` with these locked params:
   ```
   model seedance_2_0, aspect_ratio 4:3, resolution 720p, generate_audio false,
   duration = max(4, ceil(line seconds + 0.3)),
   medias: start_image <ian_keyframe_id from config/cast.json> (Ian close-up keyframe),
           image_references <ian_sheet_id from config/cast.json> (Ian sheet),
           audio_references <line media id>
   prompt: "The clay young man says the line from the audio reference with exact lip sync. <one acted beat with a physical action>.
            His hair stays very short black 360 waves with a crisp line-up, NO curls, NO twists, NO dreadlocks.
            Handmade stop-motion claymation, animated on twos, same set and lighting, static locked-off camera."
   ```
   If a submit answers "Preset … recommended", resubmit with `declined_preset_id`.
3. `jobs_wait`, then `zsh scripts/fetch.sh NN <n> <url> …` into `renders/NN/shots/<nn>.mp4`.
4. Pull a frame every second from each shot into a contact sheet and look at it:
   - Ian's hair must be short waves, never twists or locks;
   - the mouth must move;
   - no logos.
   Regenerate a bad shot once at most. Log credits spent in `renders/NN/CREDITS.txt`.

### build (deterministic, no model)
`bash scripts/build.sh NN` runs, in order:
- audio (≤ 70 s gate)
- `omega_face.py`
- the UI timeline, events and render
- `multiverse.py` jumps
- `sfxlib.py` + `sound.py` (score and sound effects)
- `compose.py` (grade, jumps, captions, ducked mix, −14 LUFS)
- the share copy, also copied to `$OMEGA_REELS_DESKTOP/NN Title/` (`scripts/deliver.sh`, default `~/Desktop/Omega Reels`; every built reel lands there, approved or not)
- QA files

Resume from a stage with `bash scripts/build.sh NN <stage>`.

### review
Read `renders/NN/QA.txt`, `qa-transcript.txt` (compare with every line; whisper sometimes doubles a phrase, so check suspicious spots by re-transcribing that window), and look at `qa-sheet.jpg`. Check:
- duration 55–70 s;
- loudness about −14;
- every line present;
- captions with no tags;
- hair right;
- every universe jump visible;
- the end card showing the keyword.

Write `renders/NN/REVIEW.md`. Its first line must be exactly `PASS` or `FAIL`, followed by the findings. On FAIL, fix what you can (re-run a build stage) and review again once.

### package (after Ian approves)
Write `renders/NN/POST.md` containing:
- the caption from the script file;
- the keyword;
- the ManyChat rule, following `manychat/SETUP.md`: comment contains WORD, then DM the repo URL;
- the file to upload.

Add the reel to `renders/BATCH.md`, then run `bash scripts/deliver.sh NN` again. That adds POST.md next to the video in `$OMEGA_REELS_DESKTOP/NN Title/` (the posting folder) and refreshes the BATCH.md there. Never post.
