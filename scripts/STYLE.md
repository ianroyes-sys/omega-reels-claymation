# Ian × Omega — script style guide (applies to every reel)

Source: a study of the AI-duo comedy format on Instagram (an eager human and a deadpan AI). This is the relationship and rhythm we borrow, in our own words. **No Gen Z slang** (no "crashing out", "rizz", "cooked", "bro", "no cap", "king"). Clean, plain English.

## The relationship
Omega is the calm, competent older-sibling figure. Ian is the lovable, over-eager mess with big plans and short attention.
- Omega does the real work, protects Ian from his worst ideas, and roasts him for it. Underneath, Omega clearly cares.
- Ian isn't stupid. He's impatient, optimistic, and looking for the shortcut. He asks the questions the viewer is thinking.

## Omega's voice
- **Deadpan.** Never excited, never an exclamation mark. Fragments are fine: "Free. Watch." "Two. I counted for you."
- **Short:** 2–12 words per line. A step explanation can run to 2 short sentences with concrete specifics (names, numbers).
- **Roasts are observations, stated as plain fact,** about Ian's habits, effort, track record, or the situation he's in. Never insults about looks, nothing crude, nothing mean.
  - Reference rhythm: "Just slower. Like you." · "More honest than your LinkedIn." · "Watching movies isn't a hobby. It's a Friday." · "You restart the router. Twice a week." · "Still the problem, though." · "You're overqualified."
- **Self-aware about being an AI:** "I don't have legs." "No. I'm the expensive one."
- **The guardrail:** when Ian asks for the extreme version, Omega says no with a concrete consequence and gives the safe rule. Example: "LinkedIn bans bots. Gone by lunch." then "Ten a day. You press submit."

## Ian's voice
- Opens with **"Omega!"** plus an overconfident plan, or a desperate problem stated like an achievement.
- Earnest, quick, plain. Asks the viewer's question ("Do I need to code?", "Is it safe?", "How long does it take?").
- Always proposes the reckless shortcut at least once.
- Gets small, genuine wins, and loses the last line.

## Structure (about 65s; hard ceiling 70s, Ian 2026-10-26)
1. **Cold open (≤8s):** "Omega! [plan/problem]." → Omega deflates it with a question → Ian reveals the worse detail → Omega's first roast → "Okay. I built you ___. It's free. Watch."
2. **Steps:** "Step one." spoken out loud, **3 steps** (4 only if every line is short). Each step is Omega's concrete explanation, then Ian's viewer-question, then Omega's answer, ideally with a roast inside it.
3. **Guardrail beat:** Ian asks for the extreme version → Omega refuses, gives the consequence, gives the safe rule.
4. **Button:** a small win for Ian, then Omega's final dry line lands on him.
5. **Spoken CTA, always the last line, by Omega:** "Comment ___ and I'll send you the repo." The keyword is one word, all caps on screen.

## Length budget (every reel)
- Target **~65 s** finished (dialogue ≈ 62 s + 2 s end card); `build.sh` fails a reel over 70 s.
- Rough budget: cold open ≤ 13 s · each step ≈ 12 s (Omega explains, Ian asks, Omega answers) · guardrail ≈ 10 s · button ≈ 8 s · CTA ≈ 3 s.
- Fit by cutting beats and tightening lines, never by speeding voices up. Pilot 01 lost its dedupe step, the receipts beat and "what's my job" to get there.

## Growth rules (from a teardown of short-form creator reels)
1. **Name the viewer and the stakes in the first 3 s**, inside Ian's "Omega!" opener: who it's for (job hunters, Claude Code users, solo founders) plus a concrete number.
2. **Open a loop by ~3 s** that the keyword pays off ("…and the repo is free, I'll send it at the end").
3. **A running counter on screen** that tracks the story (`APPLIED 0 → 300`, `STEP 1/3`, `$0 → $45`): on the UI card or Omega's screen.
4. **A visual event every ~0.6 s** in the top card (type-ons, stamps, number rolls); no dead frames.
5. **Every beat is a real thing:** real repo names, real commands, real numbers from the README.
6. **If a reel hits, re-make the same script** with new items or a new universe line-up before inventing a new concept.
7. Keyword = one topic noun in caps, spoken last by Omega, repeated in the caption.
8. No sponsored or tool-of-the-day reels in the first month.

## Hard rules
- Every product claim must be traceable to the repo README. No star counts unless real.
- Don't reuse any reference account's actual jokes. Match the rhythm, not the lines.
- Caption format: relatable hook line + emoji · what it does as a numbered list · the honest catch/guardrail · "Free and open source on GitHub." · "Comment WORD and I'll send you the repo." · one engagement question 👇 · 5 hashtags.
