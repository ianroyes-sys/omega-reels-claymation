# Reel 02 — ios-app-portfolio

Repo: https://github.com/ianroyes-sys/ios-app-portfolio
Keyword: **APPS**
Style: `scripts/STYLE.md`. Universes (v2, 2026-10-27, Ian asked for more drastic jumps): home holo → shell **1927 silent film** → design **8-bit** → feed + iPad **1987 VHS** → bakery holo. Each jump lands on a title plate ("Meanwhile… in 1927.", "PLAYER 2 · 8-BIT", "▶ PLAY 1987", "BACK HOME").
v2 also drops every sermon reference: viewers don't know what apps are in the repo, so the opener names the client types (church, dentist, bakery) and the end gag is a purple-mode callback.
Every claim is from the README or ARCHITECTURE.md:
- 24 apps, 23 SwiftUI and 1 Expo.
- Zero third-party packages.
- One design file (the `DS` enum) per client, with looks like Harvest, Velour and Petal.
- Studio builds apps for churches, ministries, creators, clinics and local businesses.
- Content comes from what the client already publishes (YouTube feeds, public calendars, their website); the YouTube feed needs no API key, quota or backend.
- `FillImage` and `.contentShape` stop photos covering buttons on iPad.
- The bakery app gives 10 points per $1 across four tiers.

The repo is a showcase with no license, and client code stays private. The free part is the playbook. Lines 5, 16 and 17 are voiced but cut for length (`skip` in `02-lines.json`).

| # | Who | Line | Top-half UI card |
|---|-----|------|------------------|
| 1 | IAN | Omega! Three new clients want iPhone apps. Same week. | 3 client requests, APPS 0/3 |
| 2 | OMEGA | And your plan? | — |
| 3 | IAN | Copy the last app. Change the logo. | `cp -r LastChurchApp/ BakeryApp/` |
| 4 | OMEGA | A church, a dentist and a bakery. One app. | church/dentist/bakery rows, ONE APP? stamp |
| 6 | OMEGA | Okay. The playbook behind our twenty-four apps. It's free. Watch. | repo card + app-type chips |
| 7 | OMEGA | Step one. Every app starts from one shell. Zero third-party packages. | STEP 1/3 file tree (CRT) |
| 8 | IAN | Zero? Not even one little package? | Package Dependencies: 0 |
| 9 | OMEGA | Nothing to update. Nothing to audit. Nothing for you to break. | three red chips |
| 10 | OMEGA | Step two. One design file per client. Edit it, and the whole app changes. | STEP 2/3 select your look (arcade) |
| 11 | IAN | So I make everything purple? | EVERYTHING PURPLE? |
| 12 | OMEGA | Each client gets a named look. Harvest. Velour. Not purple. | cursor cycles looks, NOT A LOOK |
| 13 | OMEGA | Step three. It pulls what they already post. Videos. Calendars. No server. | STEP 3/3 public feeds (VHS) |
| 14 | IAN | Okay. Ship all three tonight. Skip the iPad testing. | ship checklist |
| 15 | OMEGA | No. One stretched photo can cover the buttons on iPad. Review taps everything. | photo eats buttons → FillImage fix |
| 18 | IAN | Omega! The bakery loves their new app! | bakery app shipped |
| 19 | OMEGA | Ten points per dollar. Four tiers. Built for a bakery. | points, tiers |
| 20 | IAN | I added a purple mode. | "Purple mode" tab sneaks in |
| 21 | OMEGA | Delete it. | tab yanked |
| 22 | OMEGA | Comment APPS, and I'll send you the repo. | end card |

## Caption

3 clients. 1 week. My plan was copy, paste, change the logo. 🙃

Omega made me open-source the playbook behind our 24 client iOS apps instead (churches, clinics, bakeries, personal brands):

1. One shell for every app: SwiftUI only, zero third-party packages, nothing to update or audit
2. One design file per client: every app gets its own named look (Harvest, Velour, Petal…), and editing one file re-skins the whole app
3. Content comes from what the client already posts (their YouTube, their calendar, their website): no API key, no server

The guardrail: test on iPad. A stretched photo can cover buttons and App Review taps everything, so every photo goes through one FillImage wrapper.

It's a showcase: screenshots, design notes and the shared SwiftUI patterns with code. Client source stays private. Free to read on GitHub.

Comment APPS and I'll send you the repo.

What's the app you'd build for your favorite local business? 👇

#swiftui #iosdev #appdevelopment #freelancedeveloper #buildinpublic
