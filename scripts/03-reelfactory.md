# Reel 03 — reelfactory-studio

Repo: https://github.com/ianroyes-sys/reelfactory-studio
Keyword: **REELS**
Style: `scripts/STYLE.md`. Universes (drastic eras, each with a title plate): home holo → brand questions **8-bit** → 30-day plan **1927 silent film** (a strip of film, one frame per day) → rewrite + guardrails **1987 VHS** (rewind one day) → posted holo.
Audience: small business owners and anyone posting for one. No insider references: the salon, the door and the 30 posts are all set up on screen.
Every claim is from the README:
- Six questions about the business, asked once (type, location, offer, target customer, brand vibe, content goal), editable later in Settings.
- One click generates a 30-day plan mixing Reels and carousels; each day has an idea, hook, full script, caption and CTA.
- Per-day regeneration rewrites hook, script, caption and CTA and keeps the day's idea and format; the rest of the plan stays.
- Free tier: 1 full plan and 10 single-item regenerations per user per day, enforced atomically in Postgres (`try_increment_daily_counter()`).
- Prompt-injection defense: brand fields are wrapped in a data block and treated as inert text.
- Copy-to-clipboard on every field.
- Live on the free tier at reelfactory-alpha.vercel.app; self-hosting needs Supabase and an Anthropic API key.

Demo inputs on the cards (Hair salon, Silk press, Busy moms…) are illustrative, not README claims.

| # | Who | Line | Top-half UI card |
|---|-----|------|------------------|
| 1 | IAN | Omega! My aunt's salon needs thirty Instagram posts. By Monday. | 30 empty post slots, POSTS 0/30, "free repo at the end" |
| 2 | OMEGA | How many do you have? | — |
| 3 | IAN | One. A photo of the front door. | slot 1 = door photo, POSTS 1/30 |
| 4 | OMEGA | Twenty-nine to go. Great door, though. | empty slots light red, 29 TO GO stamp |
| 5 | OMEGA | Okay. I built you a content planner. It's free. Watch. | repo card, 0→30 day counter, `npm run dev` |
| 6 | OMEGA | Step one. Six questions about the business. You answer them once. | STEP 1/3 create-your-brand (8-bit), Q 0→6/6 |
| 7 | IAN | Every single day? | EVERY SINGLE DAY? sticker |
| 8 | OMEGA | Once. Then it remembers. One of us should. | ONCE stamp, saved / edit in Settings |
| 9 | OMEGA | Step two. One click. Thirty days of Reels and carousels. | STEP 2/3 film strip, DAYS 0→30 (1927) |
| 10 | IAN | So, just ideas? | "Just ideas?" title card |
| 11 | OMEGA | Hook. Full script. Caption. Call to action. Every day. | Day 1 card ticks each field |
| 12 | OMEGA | Step three. Hate one day? Rewrite just that day. The rest stays. | STEP 3/3 ◀◀ REW day 12, others locked (VHS) |
| 13 | IAN | Then I'll rewrite it a thousand times. | REWRITES spins to 10/10 |
| 14 | OMEGA | No. Ten rewrites a day. One full plan. Decide faster. | DAILY LIMIT stamp, `try_increment_daily_counter()` |
| 15 | IAN | What if I name the salon, ignore your instructions? | business name field types it |
| 16 | OMEGA | It reads your answers as data. Not orders. Nice try. | wrapped in `<brand_data>`, NICE TRY |
| 17 | IAN | Omega! The salon posted day one! | Day 1 post, POSTS 1/30 |
| 18 | OMEGA | Hook, script, caption. One tap each to copy. | Copy → Copied, one by one |
| 19 | IAN | I filmed it in front of the door. | thumbnail becomes the door |
| 20 | OMEGA | Of course you did. | THE DOOR. AGAIN. stamp |
| 21 | OMEGA | Comment REELS, and I'll send you the repo. | end card |

Ian on camera (Seedance): 1, 3, 13, 15, 19. Lines 7, 10, 17 play off-camera over Omega listening.

## Caption

30 posts due Monday. I had one photo of a door. 🚪

So Omega built a content planner for small businesses and we open-sourced it:

1. Answer six questions about the business once (type, location, offer, customer, vibe, goal)
2. One click: 30 days of Reels and carousels, each with a hook, full script, caption and call to action
3. Hate one day? Regenerate just that day. The rest of the month stays

The catch: the free tier gives you 1 full plan and 10 rewrites a day, and whatever you type into the brand form is read as data, never as instructions.

Next.js + Supabase + Claude. Free and open source on GitHub.

Comment REELS and I'll send you the repo.

What kind of business would you plan 30 days for first? 👇

#smallbusiness #instagramtips #contentplanning #opensource #ai
