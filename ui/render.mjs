#!/usr/bin/env node
// Render the top UI track to H.264.
//   node render.mjs [timeline.json] [out.mp4] [--reel NN]   (reel defaults to the NN- prefix of the timeline file; scenes = reels/NN.js)
//   node render.mjs [timeline.json] --stills 3.2,10,22.5 [--outdir dir]   (PNG stills only)
// Deterministic: every frame is renderAt(frame / fps). Poses are 12 fps, so
// identical poses are captured once and re-sent as held frames.
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const stillsArg = flag('--stills');
const reelArg = flag('--reel');
const outDir = flag('--outdir') || path.join(HERE, 'stills');
const tlPath = path.resolve(args[0] || path.join(HERE, 'timeline.json'));
const outPath = path.resolve(args[1] || path.join(HERE, 'top.mp4'));
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const timeline = JSON.parse(await readFile(tlPath, 'utf8'));
const W = timeline.width || 1080, H = timeline.height || 900, FPS = timeline.fps || 30, POSE = timeline.poseFps || 12;
const duration = timeline.duration || Math.max(...timeline.cues.map((c) => c.end));

// tiny static server for ui/ (fonts + css need http, not file://)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (u === '/timeline.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(timeline)); }
    const p = path.join(HERE, path.normalize(u === '/' ? '/index.html' : u));
    if (!p.startsWith(HERE)) { res.writeHead(403); return res.end(); }
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
page.on('pageerror', (e) => console.error('[page error]', e.message));
const reel = reelArg || (path.basename(tlPath).match(/^(\d+)-/) || [])[1] || '01';
await page.goto(`http://127.0.0.1:${port}/index.html?reel=${reel}`);
await page.evaluate(() => window.ready);

const shot = () => page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
const sceneKey = (t) => page.evaluate((tt) => { window.renderAt(tt); return true; }, t);

try {
  if (stillsArg) {
    await mkdir(outDir, { recursive: true });
    for (const s of stillsArg.split(',').map(Number)) {
      await sceneKey(s);
      const f = path.join(outDir, `still-${s.toFixed(2).padStart(6, '0')}.png`);
      await writeFile(f, await shot());
      console.log(f);
    }
  } else {
    const frames = Math.ceil(duration * FPS);
    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', outPath], { stdio: ['pipe', 'inherit', 'inherit'] });
    const ffDone = new Promise((res, rej) => ff.on('close', (code) => (code === 0 ? res() : rej(new Error('ffmpeg exit ' + code)))));
    const write = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once('drain', res)));
    let lastPose = null, lastBuf = null, captured = 0;
    const t0 = Date.now();
    for (let f = 0; f < frames; f++) {
      const t = f / FPS;
      const pose = Math.floor(t * POSE + 1e-6);
      if (pose !== lastPose) {
        await sceneKey(t);
        lastBuf = await shot();
        lastPose = pose; captured++;
      }
      await write(lastBuf);
      if (f % 150 === 0) process.stdout.write(`\rframe ${f}/${frames}  poses ${captured}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    await ffDone;
    console.log(`\nwrote ${outPath}  (${frames} frames @ ${FPS}fps, ${captured} unique poses, ${duration}s)`);
  }
} finally {
  await browser.close();
  server.close();
}
