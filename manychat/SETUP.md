# Comment-a-word → auto-DM (ManyChat)

The flow: someone comments a keyword on a reel → ManyChat replies publicly to the comment → sends them a DM with the repo link.

## One-time setup (Ian does this; ~10 min)
1. Instagram app → Settings → Account type → switch to **Creator** (or Business) if you haven't. ManyChat only connects to professional accounts.
2. Instagram → Settings → Messages and story replies → Message controls → **Connected tools → Allow access to messages = ON**. (Without this toggle ManyChat can't send DMs.)
3. Sign up at manychat.com with your Instagram/Facebook login and connect the account. Stay on the **Free** plan. It covers comment-keyword automations up to 1,000 contacts. Check the plan page when you sign up in case limits changed.
4. Tell me when it's connected. I'll build the automations below in Chrome, or you can paste them in yourself using the steps that follow.

## How each automation is built (repeat per reel)
ManyChat → Automation → **+ New Automation** → **Start from scratch**
- **Trigger:** "User comments on your Post or Reel"
  - Post or Reel: *Specific* → pick the reel (do this right after it's posted). If you build it before posting, choose *Next post or reel*.
  - Keyword: **contains** the keyword (case doesn't matter). Add common typos as extra keywords.
  - **Reply to comments publicly: ON**. Add 3 rotating replies (rotation helps avoid looking like spam to IG).
- **Action:** Send Message (Instagram DM). Text plus a button linking to the repo.
- Optional "follow gate": ManyChat can ask the person to follow before sending the link. Skip it at launch. It adds friction, and Instagram is cracking down on forced-follow gates.
- Turn the automation **ON**, then test from a second account. The DM only works if that account comments *after* the automation is live.

Rules that keep the account safe:
- Only DM people who commented the keyword. Never bulk-DM followers.
- DMs must go out within 24h of the comment. ManyChat handles this automatically.
- Don't put the link in the public reply. Links in comment replies get filtered.

---

## Reel 01 — HUNT → opportunity-hunter-engine

**Keywords:** `HUNT`, `hunt`, `hunter`, `HUNTT`

**Public comment replies (rotate):**
1. Sent 📬 check your DMs
2. Omega slid into your DMs. Go look 👀
3. Check requests if you don't see it 🫡

**DM:**
> yo 👋 here's the job hunter Omega built me
>
> opportunity-hunter-engine: finds entry-level jobs from Greenhouse, Ashby, Lever + Simplify every morning, kills duplicates, builds every résumé version, and Claude Code agents fill the forms. Nothing counts as "sent" without a screenshot + confirmation.
>
> you need Claude Code + Python. setup steps are in the README 👇
>
> [Button: Get the repo] → https://github.com/ianroyes-sys/opportunity-hunter-engine
>
> drop a ⭐ if it gets you an interview. follow for the next one, we're open-sourcing all of it

---

## Template for the next reels

| Reel | Repo | Keyword |
|------|------|---------|
| 01 | opportunity-hunter-engine | HUNT |
| 02 | ios-app-portfolio | APPS (see renders/02/POST.md) |
| 03 | reelfactory-studio | |
| 04 | deposit-shield-renters | |
| … | | |
