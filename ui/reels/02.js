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
    clients: { pill: 'THIS WEEK', step: 0 },
    repo: { pill: 'THE FIX', step: 0, title: 'The <em>playbook</em>, open' },
    shell: { pill: 'STEP 1/3', step: 1, title: 'One <em>shell</em>' },
    design: { pill: 'STEP 2/3', step: 2, title: 'Select your <em>look</em>' },
    feed: { pill: 'STEP 3/3', step: 3, title: 'What they <em>already post</em>' },
    ipad: { pill: 'GUARDRAILS', step: 5, title: 'Test the <em>iPad</em>' },
    rewards: { pill: 'SHIPPED', step: 5, title: 'Bakery app <em>live</em>' },
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

  /* ---------------- scenes ---------------- */
  const S = {};

  // ---- cold open + lines 1-4: three different businesses, one plan: copy-paste ----
  HEAD.clients.title = (c) => (c.reached('types') ? '3 businesses. <em>1 app?</em>' : c.reached('copy') ? '3 apps. <em>1 logo swap?</em>' : '3 clients. <em>1 week.</em>');
  S.clients = (c) => {
    const s = (f) => c.sub('clients', f);
    const copyS = c.since('copy');
    const typS = c.since('types');
    const reqs = [
      ['C', '#3B5BDB', 'Downtown church', 'events + giving app', 0.12],
      ['D', '#1F8A70', 'Dental clinic', 'booking app', 0.3],
      ['B', '#C9772B', 'Corner bakery', 'rewards + ordering app', 0.48],
    ];
    const done = c.reached('copy') ? 3 : 0;
    const rows = reqs.map(([l, col, who, what, f], i) => {
      const rs = s(f);
      const copied = copyS >= 0 && copyS > i * 3 / POSE;
      let tag = `<span class="chip amber" style="margin-left:auto">due Fri</span>`;
      if (copied) tag = `<span class="chip violet" style="margin-left:auto;${pop(copyS - i * 3 / POSE, 410 + i)}">copy of last app</span>`;
      // line 4 names each business in turn: church, dentist, bakery
      const hot = typS >= 0 && typS < c.dur('types') * 0.62 && Math.min(2, Math.floor(typS / (c.dur('types') * 0.18))) === i;
      return `<div class="mail-row" style="margin-top:14px;${rs >= 0 ? pop(rs, 400 + i) : 'visibility:hidden;'}${hot ? `box-shadow:0 0 0 3px var(--red);transform:${boil(404, c.pose, 1.2, 0.5)};` : ''}">
          <div class="avatar" style="background:${col}">${l}</div>
          <div><div class="mail-from">${who}</div><div class="mail-subj">${typS >= 0 ? '<span style="color:var(--red);font-weight:700">same app as the others</span>' : what}</div></div>
          ${tag}
        </div>`;
    }).join('');
    let cmd = '';
    if (copyS >= 0) {
      const line = 'cp -r LastApp/ NewApp/';
      cmd = `<div class="term-strip" style="margin-top:18px;${pop(copyS, 420)}"><span class="prompt">$</span> ${typed(line, copyS, 40)}${typingDone(line, copyS, 40) ? '' : '<span class="caret"></span>'}</div>`;
    }
    let note = '';
    const stS = c.sub('types', 0.62);
    if (stS >= 0) note = `<div class="stamp" style="right:40px;bottom:30px;color:#FF3B5C;font-size:58px;${slam(stS, 430, -8, c.pose)}">ONE APP?</div>`;
    return win(`${I.mail(22)} requests · this week`, `${counter('APPS', `${done}/3`, 440, c.pose, copyS >= 0)}
      <div class="mono muted" style="font-size:26px;margin-top:6px">3 new client requests</div>${rows}${cmd}${note}`);
  };

  // ---- line 6: the repo ----
  S.repo = (c) => {
    const s = (f) => c.sub('repo', f);
    const cmd = 'open ARCHITECTURE.md';
    const ts = s(0.5);
    const tags = ['Churches', 'Clinics', 'Bakeries', 'Personal brands', 'Nonprofits'];
    return win(`${I.lock(20)} github.com/ianroyes-sys`, `
      <div class="row" style="gap:20px;${pop(s(0), 450)}">
        <span class="ico" style="width:76px;height:76px;border-radius:20px;background:var(--violet-soft);color:var(--violet)">${I.repo(42)}</span>
        <div><div class="repo-name">ianroyes-sys /</div><div class="repo-name" style="font-size:38px;margin-top:4px"><b>ios-app-portfolio</b></div></div>
        <span class="chip ghost" style="margin-left:auto">Public</span>
      </div>
      <div class="repo-desc" style="${s(0.1) >= 0 ? '' : 'visibility:hidden'}">Playbook behind <b style="display:inline-block;${s(0.1) >= 0 ? `transform:${boil(451, c.pose, 1, 1)}` : ''}">${count(s(0.1), 0, 24, 0.8)}</b> client iOS apps, for every kind of business:</div>
      <div class="row" style="margin-top:22px;gap:12px;flex-wrap:wrap">
        ${tags.map((t, i) => `<span class="chip ${i % 2 ? 'ghost' : 'violet'}" style="${pop(s(0.25 + i * 0.06), 452 + i)}">${t}</span>`).join('')}
      </div>
      <div class="term-strip" style="${ts >= 0 ? '' : 'visibility:hidden'}"><span class="prompt">$</span> ${typed(cmd, ts, 30)}${typingDone(cmd, ts, 30) && c.pose % 4 < 2 ? '' : '<span class="caret"></span>'}</div>
    `);
  };

  // ---- lines 7-9: STEP 1, the shared shell (CRT universe) ----
  S.shell = (c) => {
    const s = (f) => c.sub('shell', f);
    const zeroS = c.since('zero');
    const noS = c.since('nothing');
    const tree = [
      ['App/', ''], ['├── &lt;Name&gt;App.swift', '@main'], ['├── DesignSystem.swift', 'one per app'], ['├── Components.swift', 'cards, buttons'],
      ['├── AppData.swift', 'all copy + links'], ['├── Models.swift', 'events, menus, services'], ['├── WebSheet.swift', 'link policy'], ['└── Views/', 'one file per tab'],
    ];
    const rows = tree.map(([f, why], i) => {
      const rs = s(0.1 + i * 0.07);
      return `<div class="term-line" style="${rs >= 0 ? '' : 'visibility:hidden;'}display:flex;gap:24px"><span style="width:470px">${f}</span><span class="muted"># ${why}</span></div>`;
    }).join('');
    let big = '';
    if (zeroS >= 0) {
      big = `<div class="sticker" style="right:30px;top:90px;padding:20px 26px;text-align:center;${pop(zeroS, 470, 3)}">
          <div class="mono muted" style="font-size:24px">Package Dependencies</div>
          <div style="font:700 110px/1 var(--mono);margin-top:6px;display:inline-block;transform:${boil(471, c.pose, 1.5, 2)}">0</div></div>`;
    }
    let strikes = '';
    if (noS >= 0) {
      strikes = `<div class="row" style="position:absolute;left:30px;bottom:22px;gap:14px">${['update', 'audit', 'break'].map((w, i) => {
        const ws = c.sub('nothing', 0.08 + i * 0.27);
        return `<span class="chip red" style="${ws >= 0 ? pop(ws, 480 + i) : 'visibility:hidden;'}">${I.x(18)} nothing to ${w}</span>`;
      }).join('')}</div>`;
    }
    const cmd = 'ls NewApp/App';
    return win('~/NewApp · the shared shell', `${counter('PKGS', '0', 490, c.pose, zeroS >= 0)}
      <div class="term-line"><span class="prompt">$</span> ${typed(cmd, s(0), 30)}${typingDone(cmd, s(0), 30) ? '' : '<span class="caret"></span>'}</div>
      <div style="margin-top:14px;display:flex;flex-direction:column;gap:6px">${rows}</div>
      ${big}${strikes}`, true);
  };

  // ---- lines 10-12: STEP 2, one design file per client (ARCADE universe: character select) ----
  S.design = (c) => {
    const s = (f) => c.sub('tokens', f);
    const purS = c.since('purple');
    const namS = c.since('named');
    const looks = [
      ['HARVEST', ['#050506', '#ED8C1C', '#F9BD54', '#4294DB']],
      ['VELOUR', ['#080B09', '#274731', '#F2ECDE', '#CAA96F']],
      ['PETAL', ['#FBF1ED', '#3A1A2C', '#D9276F', '#F08A6C']],
      ['DRAFT', ['#0B1120', '#2E6BE6', '#F2B33D', '#E8ECF5']],
      ['VESPER', ['#F6EFE2', '#6B2138', '#E0A458', '#2A1A1F']],
      ['SIGNAL', ['#070A0F', '#29BAE8', '#12437F', '#D9DEE6']],
    ];
    // the selection cursor: Harvest while explaining, then cycles Harvest -> Velour -> Petal on line 12
    let sel = 0;
    if (namS >= 0) sel = Math.min(2, Math.floor(clamp((namS - 0.4) / (c.dur('named') * 0.5)) * 3));
    const tiles = looks.map(([nm, sw], i) => {
      const ts = s(0.06 + i * 0.05);
      const on = i === sel && ts >= 0;
      return `<div style="position:relative;height:150px;background:#140D29;box-shadow:inset 0 0 0 3px ${on ? '#F5C53A' : '#fff'}${on ? ',0 0 0 6px #000,0 0 22px #F5C53A' : ''};padding:14px;${ts >= 0 ? pop(ts, 500 + i) : 'visibility:hidden;'}">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);height:78px;gap:4px">${sw.map((h) => `<i style="background:${h}"></i>`).join('')}</div>
          <div style="font:400 20px/1 'Press Start 2P',monospace;color:${on ? '#F5C53A' : '#fff'};margin-top:16px">${nm}</div>
          ${on ? `<div style="position:absolute;left:-14px;top:52px;font:400 26px/1 'Press Start 2P';color:#F5C53A;transform:${boil(510, c.pose, 2, 0)}">▶</div>` : ''}
        </div>`;
    }).join('');
    const [nm, sw] = looks[sel];
    const code = `enum DS { static let accent = Color(hex: "${sw[1]}") }`;
    let purple = '';
    if (purS >= 0) {
      const xs = c.sub('named', 0.55);
      purple = `<div class="sticker" style="left:190px;top:150px;padding:18px 26px;text-align:center;background:#7B2FF7;${pop(purS, 520, -3)}${xs >= 0 ? `transform:rotate(-3deg) ${boil(521, c.pose, 1, 1)};` : ''}">
          <div style="font:400 22px/1.4 'Press Start 2P';color:#fff">EVERYTHING<br>PURPLE?</div>
          ${xs >= 0 ? `<div class="stamp" style="left:20px;top:22px;color:#FF3B5C;font-size:42px;${slam(xs, 522, -10, c.pose)}">NOT A LOOK</div>` : ''}</div>`;
    }
    return win('DesignSystem.swift · one file per client', `${counter('LOOKS', '24', 530, c.pose, namS >= 0)}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:56px">${tiles}</div>
      <div class="json" style="margin-top:22px;font-size:26px;${s(0.4) >= 0 ? '' : 'visibility:hidden;'}">${typed(code, s(0.4), 50)}</div>
      ${purple}`, true);
  };

  // ---- line 13: STEP 3, content comes from what the client already publishes (VHS universe) ----
  S.feed = (c) => {
    const s = (f) => c.sub('feed', f);
    const items = [
      ['youtube.com/feeds/videos.xml', 'Videos'],
      ['calendar.google.com/…/basic.ics', 'Events'],
      ['their-website.com', 'Copy + links'],
    ];
    const n = count(s(0.25), 0, 3, 0.9);
    const rows = items.map(([src, what], i) => {
      const rs = s(0.2 + i * 0.12);
      const done = s(0.3 + i * 0.12) >= 0;
      return `<div class="field" style="height:78px;${rs >= 0 ? pop(rs, 540 + i) : 'visibility:hidden;'}">
          <span class="val" style="font-size:28px;display:flex;gap:18px;align-items:center;width:100%"><span class="mono" style="font-size:24px">${src}</span>
          ${done ? `<span class="chip violet" style="margin-left:auto;height:40px;font-size:24px">${I.arrow(18)} ${what}</span>` : ''}</span>
        </div>`;
    }).join('');
    const nos = ['No API key', 'No quota', 'No server'].map((t, i) => {
      const ns = s(0.66 + i * 0.1);
      return `<span class="chip green" style="${ns >= 0 ? pop(ns, 550 + i) : 'visibility:hidden;'}">${I.check(18)} ${t}</span>`;
    }).join('');
    return win(`${I.lock(20)} XMLParser · public feeds`, `${counter('SOURCES', n, 560, c.pose, s(0.25) >= 0)}
      <div class="term-line" style="font-size:24px;margin-top:4px"><span class="prompt">GET</span> ${typed('what the client already publishes', s(0), 40)}</div>
      <div class="form" style="margin-top:20px">${rows}</div>
      <div class="row" style="margin-top:20px;gap:12px">${nos}</div>`);
  };

  // ---- lines 14-15: guardrail, the iPad photo that eats the buttons ----
  S.ipad = (c) => {
    const shipS = c.since('ship');
    const covS = c.since('covered');
    const fixS = c.sub('covered', 0.62);
    const fixed = fixS >= 0;
    const s = (f) => c.sub('ship', f);
    // the iPad: a photo tile that overflows its row and covers the Give / Watch buttons
    const over = covS >= 0 && !fixed;
    const tap = covS >= 0 ? path(covS, [[0, 760, 470], [0.5, 600, 400], [0.7, 590, 396]]) : null;
    const tapped = covS >= 0 && covS > 0.7 && !fixed;
    const ipad = `<div style="position:absolute;left:30px;top:20px;width:620px;height:430px;border-radius:30px;background:#0B0716;box-shadow:inset 0 0 0 10px #2a2340, 0 0 0 2px var(--line);overflow:hidden">
        <div style="position:absolute;left:28px;right:28px;top:28px;height:${over ? 330 : 200}px;background:linear-gradient(135deg,#ff9a2e,#ff4fa8 55%,#4fdcff);border-radius:16px;z-index:${over ? 5 : 1};opacity:${over ? 0.88 : 1};${over ? `box-shadow:0 0 0 4px #FF3B5C;transform:${boil(570, c.pose, 1, 0.3)};` : ''}">
          <div class="mono" style="position:absolute;left:18px;bottom:14px;font-size:22px;color:#fff">${fixed ? 'FillImage("hero")' : 'Image("hero").scaledToFill()'}</div></div>
        <div class="row" style="position:absolute;left:28px;right:28px;top:250px;gap:16px;z-index:2">
          ${['Watch', 'Events', 'Give'].map((b) => `<div class="submit" style="flex:1;height:70px;font-size:26px">${b}</div>`).join('')}</div>
        ${tapped ? `<div class="chip red" style="position:absolute;left:340px;top:350px;z-index:9;${pop(covS - 0.7, 571)}">${I.x(18)} tap does nothing</div>` : ''}
        ${fixed ? `<div class="chip green" style="position:absolute;left:28px;top:350px;z-index:9;${pop(fixS, 572)}">${I.check(18)} .contentShape(Rectangle())</div>` : ''}
      </div>`;
    const list = [['Ship all 3 tonight', 0.1], ['Skip iPad testing', 0.45]].map(([t, f], i) => {
      const ls = s(f);
      const killed = i === 1 && covS >= 0;
      return `<div class="rule" style="font-size:26px;${ls >= 0 ? pop(ls, 580 + i) : 'visibility:hidden;'}${killed ? 'text-decoration:line-through;opacity:.55;' : ''}"><span class="x" style="${killed ? '' : 'background:rgba(61,255,154,.16);color:var(--green)'}">${killed ? I.x(20) : I.check(20)}</span>${t}</div>`;
    }).join('');
    const stampS = covS - 2 / POSE;
    return win('iPad · App Review', `${ipad}
      <div style="position:absolute;right:26px;top:24px;width:250px;display:flex;flex-direction:column;gap:10px">${list}</div>
      ${shipS >= 0 && cursorAt ? (tap ? cursorAt(tap[0], tap[1], 590, c.pose, tapped && c.pose % 3 === 0) : '') : ''}
      <div class="stamp" style="right:40px;bottom:30px;color:#FF3B5C;font-size:46px;${covS >= 0 && !fixed ? slam(stampS, 591, -8, c.pose) : 'visibility:hidden;'}">Test it</div>
      ${fixed ? `<div class="note" style="position:absolute;right:34px;bottom:26px;font-size:32px;${pop(fixS + 0.1, 592, 2)}">one wrapper, every photo</div>` : ''}`, true);
  };

  // ---- lines 18-21: the bakery app, shipped (and the purple mode Ian sneaked in) ----
  S.rewards = (c) => {
    const s = (f) => c.sub('bakery', f);
    const ptsS = c.since('points');
    const keptS = c.since('kept');
    const delS = c.since('delete');
    const pts = count(ptsS, 0, 120, 0.8);
    const tiers = [1, 2, 3, 4].map((t, i) => {
      const ts = c.sub('points', 0.3 + i * 0.1);
      const on = ts >= 0;
      return `<div style="flex:1;height:58px;border-radius:14px;display:grid;place-items:center;font:700 24px/1 var(--mono);${on ? `background:var(--violet);color:#0B0716;${pop(ts, 600 + i)}` : 'background:rgba(255,255,255,.05);color:var(--ink-3)'}">TIER ${t}</div>`;
    }).join('');
    const tabs = ['Menu', 'Order', 'Rewards', 'Scan'];
    let extra = '';
    if (keptS >= 0) {
      const gone = delS >= 0 ? kOf(delS - 0.25) : -1;
      if (gone < 3) {
        const tf = gone >= 0 ? `transform:translate(${[10, 120, 600][gone]}px,${[0, -80, -400][gone]}px) rotate(${[4, 18, 40][gone]}deg);` : `${pop(keptS, 610, -3)}`;
        extra = `<div class="chip" style="background:#7B2FF7;color:#fff;${tf}">Purple mode${delS >= 0 && gone < 0 ? `<span class="strike" style="transform:scaleX(1)"></span>` : ''}</div>`;
      }
    }
    return win(`${I.bolt(20)} BakeryApp · on the App Store`, `${counter('PTS', pts, 620, c.pose, ptsS >= 0)}
      <div class="tiles" style="grid-template-columns:1fr 1fr;margin-top:56px">
        <div class="tile hot" style="${pop(s(0.1), 621)}"><div class="n">10<span style="font-size:30px"> pts</span></div><div class="l">per $1</div></div>
        <div class="tile" style="${pop(s(0.2), 622)}"><div class="n">${pts}</div><div class="l">your points</div></div>
      </div>
      <div class="row" style="margin-top:18px;gap:12px">${tiers}</div>
      <div class="row" style="position:absolute;left:30px;right:30px;bottom:24px;gap:12px;justify-content:center">
        ${tabs.map((t, i) => `<span class="chip ${i === 2 ? 'violet' : 'ghost'}" style="${pop(s(0.3 + i * 0.05), 630 + i)}">${t}</span>`).join('')}${extra}
      </div>`);
  };

  // ---- end card ----
  S.endcard = (c) => {
    const s = (f) => c.sub('end', f);
    return `<div class="card end" style="display:flex;flex-direction:column">
        <div class="kicker" style="${pop(s(0), 700)}">ios-app-portfolio · free to read</div>
        <h2 style="${pop(s(0.04), 701)}">Send this to your friend who builds <em>apps for clients</em></h2>
        <div class="cta" style="${pop(s(0.18), 702, -1.5)}">Comment <span class="kw" style="display:inline-block;transform:${s(0.3) >= 0 ? boil(703, c.pose, 1.2, 2) : 'none'}">APPS</span> for the repo</div>
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
    // reel 02 v2: drastic universes. vhs wears the neon card skin plus a camcorder OSD (data-v).
    const U = (TL.universes || {})[sc.card] || 'holo';
    const SKIN = { vhs: 'neon' }[U] || U;
    if (document.body.dataset.u !== SKIN) document.body.dataset.u = SKIN;
    if (document.body.dataset.v !== U) document.body.dataset.v = U;
    const ORDER = ['holo', 'silent', 'arcade', 'vhs'];
    const NAME = { holo: 'HOME', silent: '1927', arcade: '8-BIT', vhs: '1987' };
    $hudTag.innerHTML = `UNIVERSE <b>${String(ORDER.indexOf(U) + 1).padStart(2, '0')}</b> // ${NAME[U] || U.toUpperCase()}`;
    if (U === 'vhs') {
      const sec = Math.floor(t * 30) / 30;
      const ss = String(Math.floor(sec) % 60).padStart(2, '0'), ff = String(Math.floor((sec % 1) * 30)).padStart(2, '0');
      document.getElementById('osd-date').textContent = `OCT 27 1987  11:42:${ss}:${ff}`;
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

