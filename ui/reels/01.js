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
    inbox: { pill: 'INBOX', step: 0 },
    repo: { pill: 'THE FIX', step: 0, title: 'Omega built a <em>job hunter</em>' },
    find: { pill: 'STEP 1/3', step: 1, title: 'Find the <em>jobs</em>' },
    queue: { pill: 'STEP 2/4', step: 9, title: 'Kill <em>duplicates</em>' },
    resume: { pill: 'STEP 2/3', step: 2, title: 'One résumé, <em>every version</em>', size: 70 },
    apply: { pill: 'STEP 3/3', step: 3, title: 'Apply while you <em>sleep</em>' },
    rules: { pill: 'GUARDRAILS', step: 5, title: 'Rules it <em>can’t</em> break' },
    dash: { pill: 'RESULT', step: 5, title: 'Interview <em>booked.</em>' },
    draft: { pill: 'FOLLOW-UP', step: 5, title: 'I draft. <em>You send.</em>' },
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

  /* ---------------- scenes ---------------- */
  const S = {};

  // ---- cold open + lines 1-5: inbox, rejection ----
  HEAD.inbox.title = (c) => c.reached('rejection')
    ? `300 sent. <em style="display:inline-block;${pop(c.since('rejection'), 11)}">1 reply.</em>`
    : '300 sent. <em>0 replies.</em>';
  S.inbox = (c) => {
    const sent = 300;
    const rej = c.since('rejection');
    const askS = c.since('ask');
    const unread = rej >= 0 ? 1 : 0;
    let inner = `<div class="inbox-top">
        <span class="tab">Primary <span class="chip ${unread ? 'violet' : 'ghost'}" style="height:40px;font-size:24px;margin-left:8px;vertical-align:4px">${unread}</span></span>
        <span class="tab off" style="margin-left:18px">Updates</span>
        <span style="margin-left:auto" class="chip ink">${I.send(22)} ${sent} sent</span>
      </div>`;
    if (rej < 0) {
      const askHl = askS >= 0;
      inner += `<div class="empty">
          <span class="ico" style="color:var(--ink-3)">${I.mail(78)}</span>
          <div class="big">Nothing yet.</div>
          <div class="sub">${sent} applications · <span style="display:inline-block;${askHl ? `color:var(--violet);font-weight:700;transform:${boil(21, c.pose, 1, 1.2)};` : ''}">0 replies</span></div>
        </div>`;
    } else {
      const bodyS = rej - 4 / POSE;
      const al = c.since('aligned');
      const yell = c.since('yell');
      // hand-drawn ellipse drawn on over 3 poses
      let circle = '';
      if (al >= 0) {
        const k = Math.min(3, kOf(al) + 1);
        const off = [1, 0.62, 0.28, 0][k];
        circle = `<svg viewBox="0 0 200 60" preserveAspectRatio="none"><path d="M18 34 C 20 8, 178 4, 190 26 C 200 50, 40 62, 12 44 C 2 34, 30 14, 70 10" fill="none" stroke="#5B2BD9" stroke-width="4.5" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${off}"/></svg>`;
      }
      inner += `<div style="margin-top:26px;${pop(rej, 12)}" class="mail-row">
          <div class="avatar" style="background:#C77A1C">N</div>
          <div><div class="mail-from">Northwind Talent Team</div><div class="mail-subj">Update on your application</div></div>
          <div class="unread-dot"></div>
        </div>
        <div class="mail-body" style="${bodyS >= 0 ? '' : 'visibility:hidden'}">“…we’ve decided to move forward with a candidate who is <span class="hl">more aligned${circle}</span> with the role.”</div>`;
      if (al >= 0) {
        const amp = yell >= 0 ? 4 : 1.2;
        const rot = yell >= 0 ? 2.4 : 0.6;
        const scale = yell >= 0 ? (c.pose % 2 ? 1.08 : 1.02) : 1;
        const label = yell >= 0 ? 'read <span style="text-decoration:line-through">all</span> some of it' : 'translation: read the posting';
        inner += `<div class="note" style="position:absolute;right:34px;bottom:30px;${pop(al - 4 / POSE, 13, 4)}"><span style="display:inline-block;transform:${boil(14, c.pose, amp, rot)} scale(${scale})">${label}</span></div>`;
      }
    }
    return win(`${I.lock(20)} mail · inbox`, inner);
  };

  // ---- line 6: repo card ----
  S.repo = (c) => {
    const s = (f) => c.sub('repo', f);
    const cmd = 'git clone …/opportunity-hunter-engine';
    const ts = s(0.42);
    const tags = ['Python 3.9+', 'Claude Code', 'Open source', 'Free'];
    return win(`${I.lock(20)} github.com/ianroyes-sys`, `
      <div class="row" style="gap:20px;${pop(s(0), 30)}">
        <span class="ico" style="width:76px;height:76px;border-radius:20px;background:var(--violet-soft);color:var(--violet)">${I.repo(42)}</span>
        <div><div class="repo-name">ianroyes-sys /</div><div class="repo-name" style="font-size:38px;margin-top:4px"><b>opportunity-hunter-engine</b></div></div>
        <span class="chip ghost" style="margin-left:auto">Public</span>
      </div>
      <div class="repo-desc" style="${s(0.1) >= 0 ? '' : 'visibility:hidden'}">An autonomous job, internship and fellowship pipeline for one person.</div>
      <div class="row" style="margin-top:22px;gap:12px">
        ${tags.map((t, i) => `<span class="chip ${i === 3 ? 'violet' : 'ghost'}" style="${pop(s(0.2 + i * 0.05), 40 + i)}">${t}</span>`).join('')}
      </div>
      <div class="term-strip" style="${ts >= 0 ? '' : 'visibility:hidden'}"><span class="prompt">$</span> ${typed(cmd, ts, 40)}${typingDone(cmd, ts, 40) && c.pose % 4 < 2 ? '' : '<span class="caret"></span>'}</div>
    `);
  };

  // ---- lines 7-9: STEP 1 find ----
  S.find = (c) => {
    const s = (f) => c.sub('feeds', f);
    const cmd = 'python3 engine/ats_feed.py';
    const feeds = [
      ['G', '#1E8F5E', 'Greenhouse', 'job-board API', 38],
      ['A', '#4A5BDC', 'Ashby', 'job-board API', 14],
      ['L', '#2B2B33', 'Lever', 'job-board API', 21],
      ['S', '#7A3FE4', 'SimplifyJobs', 'intern + new-grad', 57],
    ];
    const at = [0.14, 0.27, 0.4, 0.53];
    const rows = feeds.map(([l, col, name, meta, n], i) => {
      const rs = s(at[i]);
      const ns = rs - 2 / POSE;
      return `<div class="feed-row" style="${pop(rs, 50 + i)}">
        <span class="logo" style="background:${col}">${l}</span>
        <span class="feed-name">${name}</span>
        <span class="feed-meta">${meta}</span>
        <span class="feed-n">+${count(ns, 0, n, 0.5)}</span>
        <span class="ok" style="${pop(rs - 5 / POSE, 60 + i)}">${I.check(20)}</span>
      </div>`;
    }).join('');
    const tot = s(0.66);
    const filteredS = c.since('filtered');
    const camS = c.since('camera');
    const yank = camS >= 0 ? kOf(camS - 0.25) : -1; // sticker gets pulled off during line 9
    let num = count(tot, 0, 130, 0.6);
    let small = 'new roles';
    if (yank >= 1) { num = 129; small = '<span style="color:#FF7A72">1 filtered</span>'; }
    let sticker = '';
    if (filteredS >= 0 && yank < 3) {
      const ys = yank >= 0 ? `transform:translate(${[40, 220, 700][yank]}px,${[30, 160, 420][yank]}px) rotate(${[4, 14, 26][yank]}deg);` : pop(filteredS, 70, -3);
      sticker = `<div class="sticker posting" style="right:30px;bottom:96px;${ys}">
          <div class="t">Junior Data Analyst</div>
          <div class="m">Entry level · <b>5+ years experience</b></div>
          <div class="stamp" style="right:6px;bottom:-50px;font-size:46px;background:transparent;${slam(filteredS - 7 / POSE, 71, -7, c.pose)}">Filtered</div>
        </div>`;
    }
    return win('~/opportunity-hunter-engine', `
      <div class="term-line"><span class="prompt">$</span> ${typed(cmd, s(0), 40)}${typingDone(cmd, s(0), 40) ? '' : '<span class="caret"></span>'}</div>
      <div class="feed">${rows}</div>
      <div class="total" style="${tot >= 0 ? '' : 'visibility:hidden'}">
        <span class="lbl">Entry-level · U.S. metro or remote</span>
        <span class="num">${num}<small>${small}</small></span>
      </div>
      <div class="term-line" style="margin-top:22px;color:#8F87A6;${tot >= 0 ? '' : 'visibility:hidden'}"># model-free feed · public job-board APIs</div>
      ${sticker}
    `, true);
  };

  // ---- lines 10-12: STEP 2 queue / dedupe ----
  S.queue = (c) => {
    const s = (f) => c.sub('dedupe', f);
    const sameS = c.since('same');
    const noticedS = c.since('noticed');
    const TOP = 74, STRIDE = 96;
    const markS = s(0.36), collapseS = s(0.56), restS = s(0.76);
    const k = collapseS >= 0 ? kOf(collapseS) : -1;
    const acme = [
      'acme.co/jobs/481',
      'acme.co/jobs/481<mark>?ref=li</mark>',
      '<mark>ACME.co</mark>/jobs/481<mark>/</mark>',
      'acme.co/jobs/481<mark>?utm=x</mark>',
    ];
    let rows = '';
    acme.forEach((u, i) => {
      const rs = s(0.04 + i * 0.07);
      if (rs < 0) return;
      let y = TOP + i * STRIDE, extra = '', op = 1;
      const dup = i > 0 && markS >= 0;
      if (i > 0 && k >= 0) {
        if (k >= 4) return; // collapsed away
        const u2 = [0.35, 0.7, 0.92, 1][k];
        y = TOP + i * STRIDE * (1 - u2);
        op = [1, 0.85, 0.6, 0.3][k];
        extra = `transform:scale(${1 - u2 * 0.06}) rotate(${sr(i * 13 + k, 1.4).toFixed(2)}deg);`;
      }
      let right = '';
      if (i === 0) {
        if (sameS >= 0) right = `<span class="chip amber" style="${pop(sameS, 90)}">already applied</span>`;
        else if (k >= 3) right = `<span class="chip violet" style="${pop(collapseS - 3 / POSE, 91)}">×4 → 1</span>`;
        else right = '<span class="chip ghost">kept</span>';
      } else if (dup) right = `<span class="chip red" style="${pop(markS - i / POSE, 92 + i)}">duplicate</span>`;
      rows += `<div class="q-row${dup ? ' dup' : ''}" style="top:${y}px;z-index:${10 - i};opacity:${op};${i === 0 && sameS >= 0 ? `transform:${boil(95, c.pose, 1.2, 0.5)};box-shadow:0 0 0 3px var(--amber);` : ''}${extra || (k < 0 ? pop(rs, 80 + i) : '')}">
          <span class="co" style="background:#D2552B">A</span>
          <div class="who"><div class="role">Acme Robotics · Ops Associate</div><div class="url">${u}</div></div>
          ${right}
        </div>`;
    });
    if (restS >= 0) {
      [['K', '#1F6E8C', 'Kestrel Bank · Finance Analyst', 'kestrel.co/careers/22'], ['F', '#3D8B4F', 'Fieldnote · Junior PM', 'fieldnote.app/jobs/pm-1'], ['L', '#B0367A', 'Lumen Health · Ops Analyst', 'lumen.health/jobs/ops-7']].forEach(([l, col, role, url], j) => {
        rows += `<div class="q-row" style="top:${TOP + (j + 1) * STRIDE}px;${pop(restS - j * 2 / POSE, 100 + j)}">
          <span class="co" style="background:${col}">${l}</span>
          <div class="who"><div class="role">${role}</div><div class="url">${url}</div></div>
          <span class="chip ghost">new</span>
        </div>`;
      });
    }
    let note = '';
    if (noticedS >= 0) {
      note = `<div class="sticker" style="left:30px;right:30px;bottom:26px;padding:20px 24px;display:flex;align-items:center;gap:16px;font:600 28px/1.2 var(--sans);${pop(noticedS, 110, -1.2)}">
        <span class="ico" style="width:46px;height:46px;border-radius:14px;background:var(--violet);color:#fff">${I.check(24)}</span>
        Same job + same cycle = applied once.</div>`;
    }
    return win('pipeline · queue', `
      <div class="q-head"><span class="chip ghost">canonical URL + application cycle</span><span class="chip violet" style="${markS >= 0 ? `transform:${boil(96, c.pose, 1, 0.6)}` : ''}">${I.bolt(20)} dedupe</span></div>
      ${rows}${note}
    `);
  };

  // ---- lines 13-15: STEP 3 résumé ----
  S.resume = (c) => {
    const st = c.st('build');
    const s = (f) => c.sub('build', f);
    const failF = st.failAt ?? 0.62;
    const rizzS = c.since('rizz');
    const nofS = c.since('nofacts');
    const W = 176, X = [0, 221, 442, 664], CX = 332;
    const pdfs = [['tech.pdf', 0.14], ['finance.pdf', 0.24], ['ops.pdf', 0.34], ['long.pdf', failF]];
    const items = pdfs.map(([nm, f], i) => {
      const ps = s(f);
      if (ps < 0) return '';
      const kk = kOf(ps);
      const u = [0.25, 0.75, 1.04, 1][Math.min(kk, 3)];
      const x = CX + (X[i] - CX) * u;
      const bad = i === 3;
      const rot = [-6, 3, -1, 0][Math.min(kk, 3)] + (bad ? 2.5 : (i - 1.5) * 0.8);
      const badge = bad
        ? `<span class="chip red" style="${pop(ps - 3 / POSE, 120)}">${I.x(18)} 2 pages</span>`
        : `<span class="chip green" style="${pop(ps - 3 / POSE, 121 + i)}">${I.check(18)} 1 page</span>`;
      const lines = '<i class="h"></i><i class="a"></i>' + '<i></i>'.repeat(4) + '<i class="a" style="width:38%"></i>' + '<i></i>'.repeat(3);
      return `<div class="pdf${bad ? ' bad' : ''}" style="left:${x.toFixed(1)}px;transform:rotate(${rot}deg)${bad && kk >= 3 ? ` ${boil(122, c.pose, 1.5, 0.8)}` : ''};z-index:${i + 1}">
          ${bad ? '<div class="sheet2"></div>' : ''}<div class="sheet">${lines}</div>
          <div class="nm" style="${bad ? 'color:var(--red)' : ''}">${nm}</div>
          <div class="badge">${badge}</div>
        </div>`;
    }).join('');
    let bottom;
    if (rizzS < 0) {
      const failS = s(failF) - 4 / POSE;
      bottom = failS >= 0
        ? `<div class="log" style="${pop(failS, 130)}"><span class="err">✕ build failed:</span> long.pdf is 2 pages</div>`
        : `<div class="log" style="${s(0.36) >= 0 ? '' : 'visibility:hidden'}"><span class="okc">✓</span> rendered from profile/resume.json</div>`;
    } else {
      const ASK = 'fast learner", "team player';
      const w = typed(ASK, rizzS - 0.3 * c.dur('rizz'), 22);
      const strikeK = nofS >= 0 ? Math.min(3, kOf(nofS) + 1) : 0;
      const sx = [0, 0.4, 0.85, 1][strikeK];
      bottom = `<div class="json" style="${pop(rizzS, 131)}"><span class="k">"skills"</span>: [<span class="s">"Python"</span>${w ? ', ' : ''}<span class="rizz s" style="${nofS >= 0 ? 'color:#FF8C84' : ''}">${w ? `"${w}${w.length === ASK.length ? '"' : ''}` : ''}${strikeK ? `<span class="strike" style="transform:scaleX(${sx})"></span>` : ''}</span>${nofS < 0 && (!w || w.length < ASK.length || c.pose % 4 < 2) ? '<span class="caret"></span>' : ''}]</div>`;
      if (nofS >= 0) {
        bottom += `<div class="sticker" style="right:40px;top:-250px;padding:16px 22px;display:flex;align-items:center;gap:14px;font:700 28px/1 var(--sans);color:var(--red);${pop(nofS - 3 / POSE, 132, -2.5)}">
          <span class="ico" style="width:40px;height:40px;border-radius:12px;background:var(--red);color:#fff">${I.x(20)}</span>Agents may not invent facts</div>`;
      }
    }
    return win('python3 scripts/build_all_resumes.py', `
      <div class="src"><span class="chip ink" style="${pop(s(0), 133)}">${I.file(22)} profile/resume.json</span></div>
      <div class="pdfs">${items}</div>
      <div style="position:absolute;left:30px;right:30px;bottom:26px">${bottom}</div>
    `);
  };

  // ---- lines 16-18: STEP 4 apply ----
  S.apply = (c) => {
    const st = c.st('fill');
    const s = (f) => c.sub('fill', f);
    const clickF = st.clickAt ?? 0.8;
    const unvS = c.since('unverified');
    const evS = c.since('evidence');
    const fields = [
      ['Name', 'Jordan Rivera', 0.12],
      ['Email', 'jordan@example.com', 0.3],
      ['Résumé', null, 0.48],
    ];
    let active = -1;
    fields.forEach((f, i) => { if (s(f[2]) >= 0) active = i; });
    const clickS = s(clickF);
    if (s(0.62) >= 0) active = -1;
    const fh = fields.map(([lab, val, f], i) => {
      const fs = s(f);
      let v = '';
      if (val) v = typed(val, fs, 34) + (fs >= 0 && active === i && !typingDone(val, fs, 34) ? '<span class="caret" style="background:var(--violet)"></span>' : '');
      else if (fs >= 0) v = `<span class="chip violet" style="${pop(fs, 140)}">${I.file(20)} tech.pdf</span>`;
      return `<div class="field${active === i ? ' focus' : ''}"><span class="lab">${lab}</span><span class="val">${v}</span></div>`;
    }).join('');
    const pressed = clickS >= 0 && kOf(clickS) < 2;
    const clicked = clickS >= 0;
    const btn = `<div class="submit${pressed ? ' pressed' : ''}${clicked && !pressed ? ' done' : ''}">${clicked && !pressed ? `${I.check(26)} Submit clicked` : 'Submit application'}</div>`;
    // cursor: enters, travels to the button, clicks
    let cur = '';
    const cs = s(0.6);
    if (cs >= 0 && evS < 0) {
      const travel = (clickF - 0.6) * c.dur('fill');
      const [x, y] = path(cs, [[0, 820, 470], [travel * 0.8, 470, 392], [travel, 450, 386]]);
      cur = cursorAt(x, y, 141, c.pose, pressed);
    }
    let over = '';
    if (unvS >= 0 && evS < 0) {
      over = `<div class="sticker" style="left:150px;top:150px;padding:18px 24px;display:flex;gap:14px;align-items:center;${pop(unvS, 150, 2)}">
          <span class="chip amber" style="font-size:28px;height:52px">? unverified</span>
          <span style="font:600 28px/1.2 var(--sans)">24h hold · never resent blindly</span></div>`;
    }
    if (evS >= 0) {
      const e1 = c.sub('evidence', 0.08), e2 = c.sub('evidence', 0.3), e3 = c.sub('evidence', 0.55);
      over = `<div class="sticker evidence" style="left:100px;top:96px;${pop(evS, 151, -1.5)}">
          <div class="ev-row" style="${pop(e1, 152)}"><span class="ev-thumb">${I.cam(30)}</span>Screenshot saved<span class="ev-check">${I.check(22)}</span></div>
          <div class="ev-row" style="${pop(e2, 153)}"><span class="ev-thumb" style="background:linear-gradient(135deg,#1E8F5E,#0F5A3A);color:#fff">${I.mail(30)}</span>“Application received”<span class="ev-check">${I.check(22)}</span></div>
          <div class="ev-row" style="border-top:2px dashed var(--line);padding-top:16px;margin-top:4px;${e3 >= 0 ? '' : 'visibility:hidden'}"><span class="mono" style="color:var(--ink-3)">state</span>
            <span class="chip green" style="margin-left:auto;font-size:28px;height:52px;${pop(e3, 154)}">${I.check(22)} submitted</span></div>
        </div>`;
    }
    return win(`${I.lock(20)} boards.greenhouse.io/harborpine`, `
      <div class="row" style="margin-bottom:16px">
        <span class="chip violet">${I.bolt(20)} Claude Code · real browser</span>
        <span class="chip ink" style="margin-left:auto">${I.moon(20)} 2:14 AM</span>
      </div>
      <div class="form">${fh}${btn}</div>
      ${over}${cur}
    `, false, evS >= 0 || unvS >= 0 ? 'dim' : '');
  };

  // ---- lines 19-22: guardrails + STOP ----
  S.rules = (c) => {
    const cardS = c.since('card');
    const stopPh = c.since('stop');
    const st = c.st('stop');
    const stopF = st.stopAt ?? 0.7;
    const s = (f) => c.sub('stop', f);
    const dropS = s(stopF);
    const greyS = dropS - 3 / POSE;
    const napS = c.since('nap');
    let inner = '';
    // credit card bit (line 19, then NEVER stamp at line 20 start, then yanked)
    const cardOut = s(0.14);
    if (cardS >= 0 && !(cardOut >= 0 && kOf(cardOut) >= 3)) {
      let tf = pop(cardS, 160, -4);
      if (cardOut >= 0) { const kk = kOf(cardOut); tf = `transform:translate(${[30, 160, 600][kk]}px,${[40, 260, 700][kk]}px) rotate(${[-2, 14, 30][kk]}deg);`; }
      inner += `<div class="ccard" style="left:184px;top:60px;z-index:4;${tf}">
          <div class="row"><span class="chipc"></span><span style="margin-left:auto;font:700 26px/1 var(--sans);letter-spacing:.1em">APPLICATION FEE</span></div>
          <div class="num">•••• •••• 4242</div>
          <div class="meta"><span>Ian · Debit</span><span>$45.00</span></div>
          <div class="stamp" style="left:118px;top:96px;color:#FF5A50;background:transparent;mix-blend-mode:normal;font-size:64px;${slam(stopPh, 161, -12, c.pose)}">Never</div>
        </div>`;
    }
    const rules = [
      ['No application fees', 0.18],
      ['No SSNs or ID numbers', 0.3],
      ['No CAPTCHA or MFA bypass', 0.42],
      ['Never invents facts', 0.52],
    ];
    const grey = greyS >= 0;
    inner += `<div class="${grey ? 'halted' : ''}" style="display:flex;flex-direction:column;gap:10px">` + rules.map(([t, f], i) =>
      `<div class="rule" style="${s(f) >= 0 ? pop(s(f), 170 + i) : 'visibility:hidden;'}"><span class="x">${I.x(22)}</span>${t}</div>`).join('') + '</div>';
    const lanesS = s(0.58);
    inner += `<div class="lanes" style="${lanesS >= 0 ? pop(lanesS, 180) : 'visibility:hidden;'}">${['hunt', 'apply', 'follow-up', 'cull'].map((l, i) =>
      `<div class="lane${grey ? ' off' : ''}" style="${grey ? `transform:${boil(181 + i, poseOf(c.t) + (greyS < 4 / POSE ? 0 : 0), kOf(greyS) < 3 ? 3 : 0, 0)};` : ''}"><span class="led"></span>${l}</div>`).join('')}</div>`;
    if (grey) {
      inner += `<div style="position:absolute;left:30px;bottom:26px;font:700 28px/1 var(--mono);color:#FF7A72;${pop(greyS - 2 / POSE, 185)}">■ every lane halted</div>`;
    }
    if (dropS >= 0) {
      const kk = kOf(dropS);
      const y = [-420, -60, 16, -6][Math.min(kk, 3)];
      const r = [10, -6, 4, -2][Math.min(kk, 3)];
      inner += `<div class="stopfile" style="right:44px;top:36px;transform:translateY(${kk >= 4 ? 0 : y}px) rotate(${kk >= 4 ? -3 : r}deg)${kk >= 4 ? ' ' + boil(186, c.pose, 0.8, 0.5) : ''}">
          <div class="doc"><b>STOP</b></div><div class="fn">./STOP</div></div>`;
    }
    if (napS >= 0) {
      inner += `<div class="note" style="position:absolute;left:40px;bottom:80px;font-size:40px;padding:16px 24px;${pop(napS, 190, -2)}"><span style="display:inline-block;transform:${boil(191, c.pose, 1, 1)}">your job: the interview.</span></div>`;
    }
    return win('CLAUDE.md · safety rails', inner, true);
  };

  // ---- line 23: dashboard ----
  S.dash = (c) => {
    const s = (f) => c.sub('interview', f);
    const hitS = s(0.3);
    const hit = hitS >= 0;
    const rows = [
      ['K', '#1F6E8C', 'Kestrel Bank · Finance Analyst', 'submitted'],
      ['F', '#3D8B4F', 'Fieldnote · Junior PM', 'submitted'],
      ['H', '#5B2BD9', 'Harbor &amp; Pine · Ops Associate', hit ? 'interview' : 'submitted'],
    ];
    return win(`${I.file(20)} dashboard/index.html`, `
      <div class="tiles">
        <div class="tile" style="${pop(s(0), 200)}"><div class="n">48</div><div class="l">Submitted</div></div>
        <div class="tile" style="${pop(s(0.05), 201)}"><div class="n">2</div><div class="l">Unverified</div></div>
        <div class="tile${hit ? ' hot' : ''}" style="${hit ? `transform:${boil(202, c.pose, 1.2, 0.8)}` : pop(s(0.1), 202)}"><div class="n">${hit ? `<span style="display:inline-block;${pop(hitS, 203)}">1</span>` : '0'}</div><div class="l">Interview</div></div>
      </div>
      <div class="d-rows">${rows.map(([l, col, role, stt], i) => `
        <div class="d-row${i === 2 && hit ? ' win2' : ''}" style="${pop(s(0.08 + i * 0.05), 210 + i)}">
          <span class="co ico" style="width:48px;height:48px;border-radius:13px;background:${col};color:#fff;font:800 24px/1 var(--sans)">${l}</span>
          <span class="role">${role}</span>
          ${stt === 'interview' ? `<span class="chip ink" style="background:var(--cyan-ink);${pop(hitS, 214)}">${I.check(22)} Interview</span>` : `<span class="chip green">${I.check(20)} submitted</span>`}
        </div>`).join('')}
        <div class="stamp" style="left:250px;bottom:-84px;color:var(--violet);${slam(hitS - 4 / POSE, 215, -7, c.pose)}">Interview</div>
      </div>
    `);
  };

  // ---- lines 24-26: thank-you draft ----
  S.draft = (c) => {
    const ds = c.since('draft');
    const sendS = c.since('sendit');
    const waitS = c.since('wait');
    const msg = 'Hi Maya, thank you for taking the time to talk today. I enjoyed hearing how the ops team plans its week, and I’m excited about the role.';
    const bs = c.sub('draft', 0.12);
    const typedMsg = typed(msg, bs, 70);
    let cur = '';
    if (sendS >= 0) {
      const [x, y] = path(sendS, [[0, 880, 520], [0.5, 760, 410], [0.75, 730, 392]]);
      cur = cursorAt(x, y, 230, c.pose, false);
    }
    const ringOn = waitS >= 0 && (kOf(waitS) % 4) < 2;
    let note = '';
    if (waitS >= 0) {
      note = `<div class="note" style="position:absolute;right:250px;bottom:118px;font-size:36px;padding:14px 22px;${pop(waitS - 3 / POSE, 231, -3)}">you hit send.</div>`;
    }
    return win('Draft · follow-up lane', `
      <div class="mfield" style="${pop(ds, 220)}"><span class="lab">To</span>Maya Chen · Harbor &amp; Pine</div>
      <div class="mfield" style="${pop(ds - 2 / POSE, 221)}"><span class="lab">Subject</span>Thank you for today</div>
      <div class="mbody">${typedMsg}${bs >= 0 && !typingDone(msg, bs, 70) ? '<span class="caret" style="background:var(--violet)"></span>' : ''}</div>
      <div class="mfoot">
        <span class="chip violet">${I.check(20)} drafted · never sent</span>
        <div class="sendbtn" style="${sendS >= 0 ? `transform:${boil(232, c.pose, 0.8, 0.4)}` : ''}">${ringOn ? '<span class="ring"></span>' : ''}${I.send(26)} Send</div>
      </div>
      ${note}${cur}
    `);
  };

  // ---- end card ----
  S.endcard = (c) => {
    const s = (f) => c.sub('end', f);
    return `<div class="card end" style="display:flex;flex-direction:column">
        <div class="kicker" style="${pop(s(0), 300)}">opportunity-hunter-engine · free</div>
        <h2 style="${pop(s(0.04), 301)}">Send this to your friend who’s applied to <em>300 jobs</em></h2>
        <div class="cta" style="${pop(s(0.18), 302, -1.5)}">Comment <span class="kw" style="display:inline-block;transform:${s(0.3) >= 0 ? boil(303, c.pose, 1.2, 2) : 'none'}">HUNT</span> for the repo</div>
        <div class="follow" style="${pop(s(0.3), 304)}">Follow for the next one ${I.arrow(30)}</div>
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
    const U = (TL.universes || {})[sc.card] || 'holo';
    if (document.body.dataset.u !== U) document.body.dataset.u = U;
    const UI_N = ['holo', 'crt', 'arcade', 'neon'].indexOf(U) + 1;
    $hudTag.innerHTML = `UNIVERSE <b>${String(UI_N).padStart(2, '0')}</b> // ${U.toUpperCase()}`;
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
