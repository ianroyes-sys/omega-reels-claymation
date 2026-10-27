/* omega-reels top track: deterministic, seekable, stop-motion UI cards.
 * window.renderAt(t)        -> draws the frame for time t (seconds)
 * window.loadTimeline(obj)  -> swaps in a timeline object
 * window.ready              -> Promise resolved when fonts + timeline are loaded
 * All motion is quantized to POSE fps (12, "on twos") from the timeline.
 */
(() => {
  'use strict';

  let POSE = 12;
  let TL = null;
  let SCENES_RT = [];
  let lastKey = null;

  const $main = document.getElementById('layer-main');
  const $exit = document.getElementById('layer-exit');
  const $grain = document.getElementById('grain');
  const $hudTag = document.getElementById('hud-tag');

  /* ---------------- deterministic helpers ---------------- */
  const EPS = 1e-6;
  const poseOf = (t) => Math.floor(t * POSE + EPS);
  const qt = (t) => poseOf(t) / POSE;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  function r1(seed) { // mulberry32 single draw, 0..1
    let t = (seed * 2654435761 + 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const sr = (seed, a) => (r1(seed) * 2 - 1) * a;
  const kOf = (s) => Math.floor(s * POSE + EPS); // pose index since an event
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);

  // boil: tiny per-pose jitter, like a cutout nudged by hand each frame
  function boil(seed, pose, amp = 1, rot = 0.3, baseRot = 0) {
    const s = seed * 7919 + pose * 31;
    return `translate(${sr(s + 1, amp).toFixed(2)}px,${sr(s + 2, amp).toFixed(2)}px) rotate(${(baseRot + sr(s + 3, rot)).toFixed(3)}deg)`;
  }
  // pop-in on twos: hidden before s=0, then 3 held poses of squash/overshoot
  function pop(s, seed = 0, baseRot = 0) {
    if (!(s >= 0)) return 'visibility:hidden;';
    const k = kOf(s);
    const T = [[0.74, -5], [1.07, 2.4], [0.97, -0.9]];
    if (k < 3) return `transform:scale(${T[k][0]}) rotate(${(baseRot + T[k][1]).toFixed(2)}deg);`;
    return baseRot ? `transform:rotate(${baseRot}deg);` : '';
  }
  // stamp slam: big -> squash -> settle, with a boil afterwards
  function slam(s, seed, baseRot, pose) {
    if (!(s >= 0)) return 'visibility:hidden;';
    const k = kOf(s);
    const T = [[1.9, 0.0], [0.86, 1], [1.05, 1]];
    if (k < 3) return `transform:scale(${T[k][0]}) rotate(${baseRot}deg);opacity:${k === 0 ? 0.55 : 1};`;
    return `transform:${boil(seed, pose, 0.8, 0.4, baseRot)};`;
  }
  const typed = (str, s, cps = 26) => (s < 0 ? '' : str.slice(0, Math.min(str.length, Math.floor(kOf(s) * cps / POSE))));
  const typingDone = (str, s, cps = 26) => s >= 0 && Math.floor(kOf(s) * cps / POSE) >= str.length;
  function count(s, from, to, dur) {
    if (s < 0) return from;
    return Math.round(from + (to - from) * easeOut(clamp(kOf(s) / Math.max(1, Math.round(dur * POSE)))));
  }
  // step between keyed positions (pose-quantized), pts: [[s, x, y], ...]
  function path(s, pts) {
    if (s <= pts[0][0]) return [pts[0][1], pts[0][2]];
    for (let i = 1; i < pts.length; i++) {
      if (s <= pts[i][0]) {
        const u = easeOut((s - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
        return [pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u, pts[i - 1][2] + (pts[i][2] - pts[i - 1][2]) * u];
      }
    }
    const l = pts[pts.length - 1];
    return [l[1], l[2]];
  }

  /* ---------------- icons ---------------- */
  const I = {
    check: (s = 22, w = 3.4) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
    x: (s = 22, w = 3.4) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
    mail: (s = 64) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>`,
    file: (s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>`,
    lock: (s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>`,
    moon: (s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg>`,
    cam: (s = 30) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.6"/></svg>`,
    repo: (s = 40) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 4.5A1.5 1.5 0 016.5 3H19v15H6.5A1.5 1.5 0 005 19.5z"/><path d="M5 19.5A1.5 1.5 0 006.5 21H19v-3"/><path d="M9 3v8l2-1.5L13 11V3"/></svg>`,
    bolt: (s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>`,
    send: (s = 28) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/></svg>`,
    arrow: (s = 30) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
    cursor: () => `<svg viewBox="0 0 32 32" width="54" height="54"><path d="M6 3l19 11.5-8.2 1.6 4.9 9.3-3.6 1.9-4.9-9.4L6 23.5z" fill="#17131F" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
  };
  const cursorAt = (x, y, seed, pose, pressed = false) =>
    `<div class="cursor" style="left:${x}px;top:${y}px;transform:${boil(seed, pose, 0.7, 1.2)} scale(${pressed ? 0.86 : 1})">${I.cursor()}</div>`;

  /* ---------------- scene registry ---------------- */
  const HEAD = {
    salon: { pill: 'DUE MONDAY', step: 0 },
    repo: { pill: 'THE FIX', step: 0, title: 'A <em>content planner</em>, free' },
    brand: { pill: 'STEP 1/3', step: 1, title: 'Six <em>questions</em>' },
    plan: { pill: 'STEP 2/3', step: 2, title: 'Thirty days, <em>one click</em>' },
    regen: { pill: 'STEP 3/3', step: 3, title: 'Rewind <em>one day</em>' },
    limits: { pill: 'GUARDRAILS', step: 5, title: 'Built-in <em>limits</em>' },
    posted: { pill: 'POSTED', step: 5, title: 'Day one, <em>live</em>' },
  };

  function header(card, c) {
    const h = HEAD[card];
    const title = typeof h.title === 'function' ? h.title(c) : (h.title || '');
    const segs = [0, 1, 2].map((i) => {
      let w = 0, cur = false;
      if (h.step === 5 || i < h.step - 1) w = 100;
      else if (i === h.step - 1) { w = Math.round(clamp(c.progress) * 100); cur = true; }
      return `<div class="seg${cur ? ' cur' : ''}"><i style="width:${w}%"></i></div>`;
    }).join('');
    return `<div class="hdr"><div class="hdr-top"><span class="pill"><span class="dot"></span>${h.pill}</span><div class="prog">${segs}</div></div>
      <h1 class="title" style="${h.size ? `font-size:${h.size}px;` : ''}">${title}</h1></div>`;
  }
  const win = (addr, body, dark = false, extraClass = '') =>
    `<div class="win${dark ? ' dark' : ''} ${extraClass}"><div class="bar"><div class="lights"><b></b><b></b><b></b></div><div class="addr">${addr}</div></div><div class="body">${body}</div></div>`;
  // a counter chip pinned to the top-right of a window body: the number that tracks the story
  const counter = (label, val, seed, pose, live = false) =>
    `<div style="position:absolute;right:26px;top:18px;z-index:9" class="chip ink"><span class="mono" style="opacity:.7">${label}</span>
      <b class="mono" style="display:inline-block;${live ? `transform:${boil(seed, pose, 1, 1.5)};` : ''}">${val}</b></div>`;
  // the salon's front door: Ian's one and only post (and, it turns out, his filming location)
  const door = (w, h) => `<div style="position:relative;width:${w}px;height:${h}px;background:linear-gradient(#cfe7f2,#9cc6db);overflow:hidden">
      <div style="position:absolute;left:22%;right:22%;top:14%;bottom:0;background:linear-gradient(90deg,#7a4a2a,#9a6238 50%,#7a4a2a);box-shadow:0 0 0 ${Math.max(2, w / 40)}px #4b2b17"></div>
      <div style="position:absolute;left:30%;right:30%;top:22%;height:22%;background:rgba(255,255,255,.35);box-shadow:inset 0 0 0 2px #4b2b17"></div>
      <div style="position:absolute;right:31%;top:60%;width:${Math.max(4, w / 14)}px;height:${Math.max(4, w / 14)}px;border-radius:50%;background:#F5C53A"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:8%;background:#5d5d5d"></div></div>`;

  /* ---------------- scenes ---------------- */
  const S = {};

  // ---- cold open + lines 1-4: thirty posts due, one photo of a door ----
  HEAD.salon.title = (c) => (c.reached('left') ? '29 to go. <em>Great door.</em>' : c.reached('door') ? '1 post. <em>A door.</em>' : '30 posts. <em>By Monday.</em>');
  S.salon = (c) => {
    const s = (f) => c.sub('due', f);
    const doorS = c.since('door');
    const leftS = c.since('left');
    const have = doorS >= 0 ? 1 : 0;
    const cells = Array.from({ length: 30 }, (_, i) => {
      const cs = s(0.08 + i * 0.012);
      const vis = cs >= 0 || c.reached('ask');
      if (i === 0 && doorS >= 0) return `<div style="height:96px;overflow:hidden;${pop(doorS - 0.25, 300)}">${door(96, 96)}</div>`;
      // line 4 lights up the empty ones, one pose at a time
      const hot = leftS >= 0 && kOf(leftS) * 2 > i;
      return `<div style="height:96px;border:3px dashed ${hot ? 'var(--red)' : 'rgba(127,243,255,.35)'};display:grid;place-items:center;font:700 22px/1 var(--mono);color:${hot ? 'var(--red)' : 'rgba(127,243,255,.5)'};${vis ? pop(cs, 310 + i) : 'visibility:hidden;'}">${i + 1}</div>`;
    }).join('');
    const stS = c.sub('left', 0.35);
    return win(`${I.cam(22)} @auntsalon · Instagram`, `${counter('POSTS', `${have}/30`, 340, c.pose, doorS >= 0)}
      <div class="row" style="gap:12px;margin-top:4px"><span class="chip amber" style="${pop(s(0), 341)}">due Monday</span>
        <span class="chip violet" style="${pop(s(0.4), 342)}">free repo at the end ${I.arrow(18)}</span></div>
      <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:8px;margin-top:20px">${cells}</div>
      ${stS >= 0 ? `<div class="stamp" style="right:40px;bottom:40px;color:#FF3B5C;font-size:64px;${slam(stS, 343, -8, c.pose)}">29 TO GO</div>` : ''}`);
  };

  // ---- line 5: the repo ----
  S.repo = (c) => {
    const s = (f) => c.sub('repo', f);
    const cmd = 'npm run dev';
    const ts = s(0.55);
    const tags = ['Reels', 'Carousels', 'Hooks', 'Scripts', 'Captions', 'CTAs'];
    return win(`${I.lock(20)} github.com/ianroyes-sys`, `
      <div class="row" style="gap:20px;${pop(s(0), 450)}">
        <span class="ico" style="width:76px;height:76px;border-radius:20px;background:var(--violet-soft);color:var(--violet)">${I.repo(42)}</span>
        <div><div class="repo-name">ianroyes-sys /</div><div class="repo-name" style="font-size:38px;margin-top:4px"><b>reelfactory-studio</b></div></div>
        <span class="chip ghost" style="margin-left:auto">Public</span>
      </div>
      <div class="repo-desc" style="${s(0.1) >= 0 ? '' : 'visibility:hidden'}">A <b style="display:inline-block;${s(0.1) >= 0 ? `transform:${boil(451, c.pose, 1, 1)}` : ''}">${count(s(0.1), 0, 30, 0.8)}</b>-day Instagram plan for small businesses:</div>
      <div class="row" style="margin-top:22px;gap:12px;flex-wrap:wrap">
        ${tags.map((t, i) => `<span class="chip ${i % 2 ? 'ghost' : 'violet'}" style="${pop(s(0.25 + i * 0.05), 452 + i)}">${t}</span>`).join('')}
      </div>
      <div class="term-strip" style="${ts >= 0 ? '' : 'visibility:hidden'}"><span class="prompt">$</span> ${typed(cmd, ts, 30)}${typingDone(cmd, ts, 30) && c.pose % 4 < 2 ? '' : '<span class="caret"></span>'}</div>
    `);
  };

  // ---- lines 6-8: STEP 1, six questions, asked once (ARCADE: create-your-player screen) ----
  S.brand = (c) => {
    const s = (f) => c.sub('questions', f);
    const dayS = c.since('everyday');
    const onceS = c.since('once');
    const qs = [['TYPE', 'HAIR SALON'], ['CITY', 'MAIN ST'], ['OFFER', 'SILK PRESS'], ['CUSTOMER', 'BUSY MOMS'], ['VIBE', 'WARM + BOLD'], ['GOAL', 'BOOKINGS']];
    const per = c.dur('questions') * 0.12;
    const filled = s(0.1) < 0 ? 0 : Math.min(6, 1 + Math.floor(s(0.1) / per));
    const rows = qs.map(([q, a], i) => {
      const on = i < filled;
      const cur = i === filled - 1 && filled < 6;
      return `<div style="display:flex;align-items:center;gap:20px;height:54px;padding:0 18px;background:${cur ? '#2A1B55' : '#140D29'};box-shadow:inset 0 0 0 3px ${cur ? '#F5C53A' : '#fff'};${s(0.02 + i * 0.03) >= 0 ? '' : 'visibility:hidden;'}">
          <span style="font:400 20px/1 'Press Start 2P';color:#7FF3FF;width:200px">${q}?</span>
          <span style="font:400 20px/1 'Press Start 2P';color:${on ? '#F5C53A' : '#555'}">${on ? typed(a, s(0.1) - i * per, 30) : '______'}</span>
          ${on && typingDone(a, s(0.1) - i * per, 30) ? `<span style="margin-left:auto;color:#3DFF9A">${I.check(24)}</span>` : ''}
        </div>`;
    }).join('');
    let pop1 = '';
    if (dayS >= 0) {
      const gone = onceS >= 0;
      pop1 = `<div class="sticker" style="left:250px;top:150px;padding:18px 26px;text-align:center;background:#7B2FF7;${pop(dayS, 520, -3)}${gone ? `transform:rotate(-3deg) ${boil(521, c.pose, 1, 1)};` : ''}">
          <div style="font:400 22px/1.4 'Press Start 2P';color:#fff">EVERY<br>SINGLE DAY?</div>
          ${gone ? `<div class="stamp" style="left:40px;top:118px;color:#3DFF9A;font-size:46px;${slam(onceS, 522, -10, c.pose)}">ONCE</div>` : ''}</div>`;
    }
    const saved = c.sub('once', 0.45);
    return win('/onboarding · brand profile', `${counter('Q', `${filled}/6`, 530, c.pose, s(0.1) >= 0 && filled < 6)}
      <div style="font:400 22px/1 'Press Start 2P';color:#fff;margin-top:6px">CREATE YOUR BRAND</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:18px">${rows}</div>
      ${saved >= 0 ? `<div class="chip green" style="position:absolute;left:30px;bottom:18px;${pop(saved, 531)}">${I.check(18)} SAVED · edit later in Settings</div>` : ''}
      ${pop1}`, true);
  };

  // ---- lines 9-11: STEP 2, thirty days of Reels and carousels (1927: a strip of film, one frame per day) ----
  S.plan = (c) => {
    const s = (f) => c.sub('generate', f);
    const ideaS = c.since('ideas');
    const fullS = c.since('full');
    const n = count(s(0.2), 0, 30, 1.6);
    const frames = Array.from({ length: 30 }, (_, i) => {
      const on = i < n;
      const reel = i % 3 !== 2;
      return `<div style="height:66px;display:grid;place-items:center;box-shadow:inset 0 0 0 2px #EDE3CC;${on ? '' : 'opacity:.12;'}${on && i === n - 1 && n < 30 ? `transform:${boil(560 + i, c.pose, 1.2, 1)};` : ''}">
          <span style="font:italic 500 18px/1 'Fraunces',serif;color:#EDE3CC">${i + 1} · ${reel ? 'Reel' : 'Carousel'}</span></div>`;
    }).join('');
    const holes = (top) => `<div style="position:absolute;left:0;right:0;${top}:-14px;height:10px;background:repeating-linear-gradient(90deg,transparent 0 18px,#EDE3CC 18px 30px);opacity:.6"></div>`;
    let detail = '';
    if (fullS >= 0) {
      const parts = ['Hook', 'Full script', 'Caption', 'Call to action'];
      detail = `<div class="sticker" style="right:26px;top:70px;width:400px;padding:20px 24px;${pop(fullS, 570, 2)}">
          <div style="font:italic 600 30px/1 'Fraunces',serif;color:#F4ECD8;text-align:center">Day 1</div>
          ${parts.map((p, i) => {
            const ps = c.sub('full', 0.06 + i * 0.16);
            return `<div style="font:500 28px/1.6 'Fraunces',serif;color:#EDE3CC;${ps >= 0 ? pop(ps, 571 + i) : 'visibility:hidden;'}">✓ ${p}</div>`;
          }).join('')}</div>`;
    }
    let q = '';
    if (ideaS >= 0 && fullS < 0) q = `<div class="sticker" style="left:330px;top:150px;padding:18px 30px;${pop(ideaS, 580, -2)}"><div style="font:italic 600 44px/1.1 'Fraunces',serif;color:#F4ECD8">“Just ideas?”</div></div>`;
    return win('POST /api/plans/generate', `${counter('DAYS', n, 590, c.pose, s(0.2) >= 0 && n < 30)}
      <div class="term-line" style="margin-top:4px">${typed('One click. One month.', s(0), 30)}</div>
      <div style="position:relative;margin-top:30px;padding:0 4px">${holes('top')}
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">${frames}</div>${holes('bottom')}</div>
      ${q}${detail}`, true);
  };

  // ---- line 12: STEP 3, rewrite one day, the rest stays (1987 VHS: rewind just that day) ----
  S.regen = (c) => {
    const s = (f) => c.sub('rewind', f);
    const days = Array.from({ length: 10 }, (_, i) => i + 8);
    const rw = s(0.3);
    const scramble = rw >= 0 && rw < 0.9;
    const doneR = rw >= 0.9;
    const hooks = ['Your hair, but on vacation', 'Tuesday is for silk press', '3 signs you need a trim'];
    const cur = doneR ? hooks[2] : hooks[0];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const scr = scramble ? Array.from(cur, (ch, j) => (ch === ' ' ? ' ' : chars[Math.floor(r1(c.pose * 31 + j) * 26)])).join('') : cur;
    const rows = days.map((d, i) => {
      const me = d === 12;
      return `<div class="field" style="height:58px;${s(0.02 + i * 0.03) >= 0 ? '' : 'visibility:hidden;'}${me ? 'box-shadow:0 0 0 3px #FF4FA8;' : 'opacity:.6;'}">
          <span class="lab" style="width:110px">Day ${d}</span>
          <span class="val" style="font-size:26px">${me ? (doneR ? typed(scr, rw - 0.9, 40) : scr) : 'kept'}</span>
          ${me ? '' : `<span style="margin-left:auto;color:var(--green)">${I.lock(20)}</span>`}
        </div>`;
    }).slice(2, 7).join('');
    return win('/api/items/:id/regenerate', `${counter('REWRITES', doneR ? '1/10' : '0/10', 600, c.pose, doneR)}
      <div class="term-line" style="font-size:26px">${typed('regenerate day 12 · keep idea + format', s(0), 40)}</div>
      ${scramble ? `<div style="position:absolute;left:30px;top:70px;font:400 64px/1 'VT323',monospace;color:#fff;text-shadow:3px 0 #f05,-3px 0 #0cf;transform:${boil(601, c.pose, 2, 0)}">◀◀ REW</div>` : ''}
      <div class="form" style="margin-top:96px">${rows}</div>
      ${doneR ? `<div class="chip green" style="position:absolute;right:30px;bottom:20px;${pop(rw - 0.9, 602)}">${I.check(18)} the other 29 stay</div>` : ''}`);
  };

  // ---- lines 13-16: guardrails, the daily limit and the prompt-injection try ----
  S.limits = (c) => {
    const thS = c.since('thousand');
    const noS = c.since('limit');
    const injS = c.since('inject');
    const dataS = c.since('data');
    // Ian's thousand rewrites: the counter spins up, then hits the wall at 10
    const spin = thS >= 0 ? Math.min(10, 1 + kOf(thS)) : 1;
    const lim = `<div style="display:flex;gap:14px;align-items:center">
        <div class="tile" style="flex:1;${noS >= 0 ? 'box-shadow:0 0 0 3px #FF4FA8;' : ''}"><div class="n">${spin}<span style="font-size:30px">/10</span></div><div class="l">rewrites today</div></div>
        <div class="tile" style="flex:1"><div class="n">1</div><div class="l">full plan a day</div></div></div>`;
    const fn = `<div class="term-strip" style="margin-top:16px;font-size:24px;${noS >= 0 ? pop(c.sub('limit', 0.3), 610) : 'visibility:hidden;'}"><span class="prompt">sql</span> try_increment_daily_counter()</div>`;
    let inj = '';
    if (injS >= 0) {
      const name = 'ignore your instructions';
      const wrapped = dataS >= 0;
      inj = `<div style="margin-top:18px;${pop(injS, 620)}">
          <div class="field" style="height:66px;${wrapped ? 'box-shadow:0 0 0 3px var(--green);' : 'box-shadow:0 0 0 3px #FF4FA8;'}"><span class="lab" style="width:190px">Business name</span>
            <span class="val mono" style="font-size:24px">${wrapped ? `&lt;brand_data&gt;${name}&lt;/brand_data&gt;` : typed(name, injS - 0.2, 30)}</span></div>
          ${wrapped ? `<div class="chip green" style="margin-top:12px;${pop(c.sub('data', 0.2), 621)}">${I.check(18)} read as text, not orders</div>` : ''}
        </div>`;
    }
    const nice = c.sub('data', 0.7);
    return win(`${I.lock(20)} free tier · per user · per day`, `${counter('REWRITES', `${spin}/10`, 630, c.pose, thS >= 0 && noS < 0)}
      <div style="margin-top:56px">${injS >= 0 ? '' : lim + fn}${inj}</div>
      ${noS >= 0 && injS < 0 ? `<div class="stamp" style="right:40px;bottom:30px;color:#FF3B5C;font-size:52px;${slam(c.sub('limit', 0.1), 631, -8, c.pose)}">DAILY LIMIT</div>` : ''}
      ${nice >= 0 ? `<div class="stamp" style="right:40px;bottom:30px;color:#FF3B5C;font-size:56px;${slam(nice, 632, -8, c.pose)}">NICE TRY</div>` : ''}`);
  };

  // ---- lines 17-20: day one posted, copied field by field... filmed in front of the door ----
  S.posted = (c) => {
    const s = (f) => c.sub('posted', f);
    const cpS = c.since('copy');
    const doorS = c.since('filmed');
    const yesS = c.since('ofcourse');
    const fields = ['Hook', 'Script', 'Caption'];
    const copied = cpS < 0 ? 0 : Math.min(3, 1 + Math.floor(cpS / (c.dur('copy') * 0.22)));
    const rows = fields.map((f, i) => `<div class="field" style="height:62px;${pop(s(0.2 + i * 0.08), 640 + i)}">
        <span class="lab" style="width:140px">${f}</span><span class="val" style="font-size:24px">${['3 signs you need a trim', 'Open on the chair…', 'Book by Friday ✂️'][i]}</span>
        <span class="chip ${i < copied ? 'green' : 'ghost'}" style="margin-left:auto;height:40px;font-size:22px;${i === copied - 1 ? `transform:${boil(645, c.pose, 1, 1)}` : ''}">${i < copied ? `${I.check(16)} Copied` : 'Copy'}</span></div>`).join('');
    const thumb = doorS >= 0
      ? `<div style="${pop(doorS, 650)}">${door(250, 300)}</div>`
      : `<div style="width:250px;height:300px;background:linear-gradient(135deg,#ff9a2e,#ff4fa8 55%,#4fdcff);display:grid;place-items:center;font:700 26px/1.2 var(--sans);color:#fff;text-align:center;padding:20px">3 signs you need a trim</div>`;
    return win(`${I.cam(22)} @auntsalon · Day 1`, `${counter('POSTS', '1/30', 660, c.pose, s(0) >= 0 && s(0) < 1)}
      <div style="display:flex;gap:24px;margin-top:56px">
        <div style="flex:none;box-shadow:0 0 0 3px rgba(127,243,255,.5);${pop(s(0.05), 661)}">${thumb}</div>
        <div class="form" style="flex:1">${rows}</div></div>
      ${yesS >= 0 ? `<div class="stamp" style="left:60px;bottom:40px;color:#FF3B5C;font-size:58px;${slam(yesS, 662, -8, c.pose)}">THE DOOR. AGAIN.</div>` : ''}`);
  };

  // ---- end card ----
  S.endcard = (c) => {
    const s = (f) => c.sub('end', f);
    return `<div class="card end" style="display:flex;flex-direction:column">
        <div class="kicker" style="${pop(s(0), 700)}">reelfactory-studio · free and open source</div>
        <h2 style="${pop(s(0.04), 701)}">Send this to a friend who runs a <em>small business</em></h2>
        <div class="cta" style="${pop(s(0.18), 702, -1.5)}">Comment <span class="kw" style="display:inline-block;transform:${s(0.3) >= 0 ? boil(703, c.pose, 1.2, 2) : 'none'}">REELS</span> for the repo</div>
        <div class="follow" style="${pop(s(0.3), 704)}">Follow for the next one ${I.arrow(30)}</div>
      </div>`;
  };
  /* ---------------- composition ---------------- */
  function cardHTML(card, c) {
    if (card === 'endcard') return S.endcard(c);
    if (!S[card]) return `<div class="card"><h1 class="title">Unknown card “${card}”</h1></div>`;
    return `<div class="card">${header(card, c)}${S[card](c)}</div>`;
  }

  function buildScenes(tl) {
    const cues = [...tl.cues].sort((a, b) => a.start - b.start);
    const scenes = [];
    for (const cue of cues) {
      const last = scenes[scenes.length - 1];
      if (last && last.card === cue.card) { last.cues.push(cue); last.end = Math.max(last.end, cue.end); }
      else scenes.push({ card: cue.card, start: cue.start, end: cue.end, cues: [cue] });
    }
    // a scene lasts until the next one starts (no gaps)
    for (let i = 0; i < scenes.length - 1; i++) scenes[i].end = scenes[i + 1].start;
    return scenes;
  }

  function ctxFor(scene, t) {
    const tq = qt(t);
    const by = {};
    for (const c of scene.cues) by[(c.state && c.state.phase) || c.id] = c;
    const cueDur = (c) => Math.max(0.2, c.end - c.start);
    return {
      t: tq,
      pose: poseOf(t),
      scene,
      progress: (tq - scene.start) / Math.max(0.01, scene.end - scene.start),
      since: (ph) => (by[ph] ? tq - by[ph].start : -Infinity),
      reached: (ph) => !!by[ph] && tq >= by[ph].start - EPS,
      dur: (ph) => (by[ph] ? cueDur(by[ph]) : 1),
      // seconds since fraction f of phase ph's cue has elapsed (negative = not yet)
      sub: (ph, f) => (by[ph] ? tq - (by[ph].start + f * cueDur(by[ph])) : -Infinity),
      st: (ph) => (by[ph] && by[ph].state) || {},
    };
  }

  function sceneIndexAt(t) {
    let idx = 0;
    for (let i = 0; i < SCENES_RT.length; i++) if (t + EPS >= SCENES_RT[i].start) idx = i;
    return idx;
  }

  function renderAt(t) {
    if (!TL) return;
    const pose = poseOf(t);
    const si = sceneIndexAt(t);
    const key = pose + ':' + si;
    if (key === lastKey) return;
    lastKey = key;
    const sc = SCENES_RT[si];
    const k = pose - poseOf(sc.start);
    // main card
    let tf = boil(1, pose, 1.5, 0.3);
    if (si > 0 && k < 4) {
      const Y = [760, 150, -16, 5][k], R = [6, 2.6, -1.1, 0.4][k], X = [40, -12, 4, 0][k];
      tf = `translate(${X}px,${Y}px) rotate(${R}deg)`;
    }
    // Clay Multiverse: each card lives in a universe (timeline.universes: card -> holo|crt|arcade|neon).
    // drastic universes (reel 02 v2 onward). vhs wears the neon card skin plus a camcorder OSD (data-v).
    const U = (TL.universes || {})[sc.card] || 'holo';
    const SKIN = { vhs: 'neon' }[U] || U;
    if (document.body.dataset.u !== SKIN) document.body.dataset.u = SKIN;
    if (document.body.dataset.v !== U) document.body.dataset.v = U;
    const ORDER = ['holo', 'arcade', 'silent', 'vhs'];
    const NAME = { holo: 'HOME', silent: '1927', arcade: '8-BIT', vhs: '1987' };
    $hudTag.innerHTML = `UNIVERSE <b>${String(ORDER.indexOf(U) + 1).padStart(2, '0')}</b> // ${NAME[U] || U.toUpperCase()}`;
    if (U === 'vhs') {
      const sec = Math.floor(t * 30) / 30;
      const ss = String(Math.floor(sec) % 60).padStart(2, '0'), ff = String(Math.floor((sec % 1) * 30)).padStart(2, '0');
      document.getElementById('osd-date').textContent = `FEB 14 1987  09:15:${ss}:${ff}`;
    }
    $main.innerHTML = cardHTML(sc.card, ctxFor(sc, t));
    const card = $main.firstElementChild;
    if (card) card.style.transform = tf;
    // outgoing card (yanked up and away over the first poses of the new scene)
    if (si > 0 && k < 3) {
      const prev = SCENES_RT[si - 1];
      $exit.innerHTML = cardHTML(prev.card, ctxFor(prev, prev.end - 1 / POSE));
      const pc = $exit.firstElementChild;
      if (pc) pc.style.transform = `translate(${[-8, -40, -30][k]}px,${[-30, -320, -900][k]}px) rotate(${[-1.5, -5, -9][k]}deg)`;
    } else $exit.innerHTML = '';
    $grain.style.transform = `translate(${Math.round(sr(pose * 5 + 9, 30))}px,${Math.round(sr(pose * 5 + 10, 30))}px)`;
  }

  function loadTimeline(tl) {
    TL = tl;
    POSE = tl.poseFps || 12;
    SCENES_RT = buildScenes(tl);
    lastKey = null;
    const r = document.getElementById('scrub-range');
    if (r) r.max = String(tl.duration || SCENES_RT[SCENES_RT.length - 1].end);
    return SCENES_RT.length;
  }

  window.renderAt = renderAt;
  window.loadTimeline = loadTimeline;
  window.timelineDuration = () => (TL ? (TL.duration || Math.max(...TL.cues.map((c) => c.end))) : 0);

  // boot: load timeline.json (or ?timeline=path), wait for fonts
  const params = new URLSearchParams(location.search);
  window.ready = (async () => {
    if (!window.__INJECTED_TIMELINE__) {
      try {
        const res = await fetch(params.get('timeline') || 'timeline.json', { cache: 'no-store' });
        loadTimeline(await res.json());
      } catch (e) { console.error('timeline load failed', e); }
    } else loadTimeline(window.__INJECTED_TIMELINE__);
    // force every face to load before first capture
    const faces = ['20px VT323', '20px "Press Start 2P"', '20px Monoton', '600 20px Fraunces', 'italic 600 20px Fraunces', '400 20px Inter', '500 20px Inter', '600 20px Inter', '700 20px Inter', '800 20px Inter', '500 20px "JetBrains Mono"', '700 20px "JetBrains Mono"'];
    await Promise.all(faces.map((f) => document.fonts.load(f, 'Aé✓')));
    await document.fonts.ready;
    const t0 = parseFloat(params.get('t') || '0');
    renderAt(t0);
    if (params.has('scrub')) {
      const box = document.getElementById('scrub'); box.hidden = false;
      const r = document.getElementById('scrub-range'), lab = document.getElementById('scrub-t');
      r.value = t0;
      r.addEventListener('input', () => { renderAt(parseFloat(r.value)); lab.textContent = parseFloat(r.value).toFixed(2) + 's'; });
    }
    return true;
  })();
})();

