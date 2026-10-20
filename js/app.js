/* focus.shubh — everything on the page is drawn from data/manifest.js (written by build.py). */
(function () {
  'use strict';

  const D = window.FOCUS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  if (!D || !D.frames || !D.frames.length) {
    $('main').replaceChildren(el('p', 'nojs', 'No photographs yet. Add some to photos/ and run: python3 build.py'));
    return;
  }

  const site = D.site || {};
  const frames = D.frames;
  const total = frames.length;
  const byId = new Map(frames.map(f => [f.id, f]));
  const seriesById = new Map(D.series.map(s => [s.id, s]));
  const featured = frames.filter(f => f.feat).slice(0, 9);
  const devFrames = frames.filter(f => f.raw);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const pad = n => String(n).padStart(3, '0');
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeIn = t => t * t * t;
  const root = document.documentElement;
  const BLADES = 7; // aperture blades, here and in the viewer's iris

  function exifLine(f) {
    const x = f.exif || {};
    return [
      x.f && 'ƒ/' + x.f,
      x.s && (/s$/.test(x.s) ? x.s : x.s + 's'),
      x.iso && 'ISO ' + x.iso,
      x.fl,
    ].filter(Boolean).join('  ·  ');
  }

  function photo(f, sizes, opt = {}) {
    const set = opt.raw ? f.raw : f.src;
    const im = new Image(f.w, f.h);
    im.alt = opt.alt != null ? opt.alt
      : `${f.title}, from ${seriesById.get(f.series).title}${opt.raw ? ' (unedited)' : ''}`;
    im.decoding = 'async';
    im.loading = opt.eager ? 'eager' : 'lazy';
    im.sizes = sizes;
    im.srcset = set.map(([w, p]) => `${p} ${w}w`).join(', ');
    im.src = set[Math.min(1, set.length - 1)][1];
    im.style.backgroundColor = f.pal[0];
    return im;
  }

  function swatches(node, f) {
    node.replaceChildren(...f.pal.map(c => {
      const s = el('span');
      s.style.background = c;
      s.title = c;
      return s;
    }));
  }

  /* ---------------------------------------------------------- sound: synthesised, off until asked for */
  const sound = { on: false, ac: null };
  try { sound.on = localStorage.getItem('sound') === 'on'; } catch (e) { /* private mode */ }

  function sfx(kind) {
    if (!sound.on) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = sound.ac || (sound.ac = new AC());
    if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime;
    const noise = (at, freq, dur, gain) => { // one mechanical click: a short burst of filtered noise
      const n = Math.round(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4);
      const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.1; g.gain.value = gain;
      src.connect(bp).connect(g).connect(ac.destination);
      src.start(t + at);
    };
    const beep = at => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 2900;
      g.gain.setValueAtTime(0, t + at);
      g.gain.linearRampToValueAtTime(.05, t + at + .006);
      g.gain.exponentialRampToValueAtTime(.0001, t + at + .06);
      o.connect(g).connect(ac.destination);
      o.start(t + at); o.stop(t + at + .07);
    };
    if (kind === 'shutter') { noise(0, 3400, .045, .9); noise(.085, 1700, .07, .65); }
    if (kind === 'lock') { beep(0); beep(.085); }
  }

  /* ---------------------------------------------------------- copy from site.json */
  const [tagA, tagB] = site.tagline || [];
  if (tagA) { $('#tag-a').textContent = tagA; $('#about-a').textContent = tagA; }
  if (tagB) { $('#tag-b').textContent = tagB; $('#about-b').textContent = tagB; }
  if (site.name) { $('#live-name').textContent = site.name; $('#foot-name').textContent = site.name; }
  if (site.handle) $('#live-handle').textContent = site.handle;
  $('#year').textContent = new Date().getFullYear();
  $('[data-count="series"]').textContent = D.series.length;
  $('[data-count="frames"]').textContent = total;
  $('[data-count="develop"]').textContent = devFrames.length || '';
  $('#series-lede').textContent =
    `${D.series.length} series, ${total} frames and counting. Each one opens on its own contact sheet.`;
  $('#foot-count').textContent = `${total} frames · ${D.series.length} series · last developed ${D.built}`;
  $('#foot-note').textContent = site.placeholder || '';

  /* ---------------------------------------------------------- viewfinder strip */
  const hud = $('#hud'), hudExif = $('#hud-exif'), hudFrame = $('#hud-frame'), hudScale = $('#hud-scale');
  const MARKS = ['0.3', '0.5', '0.7', '1', '1.5', '2', '3', '5', '10', '∞'];
  const PITCH = 64;
  hudScale.append(...MARKS.map(m => el('span', '', m)));
  let hoverFrame = null, lockFrame = null;

  // The strip redraws like a camera LCD: new characters flicker in from the left.
  let typing = 0;
  function typeTo(node, text) {
    if (node.dataset.text === text) return;
    node.dataset.text = text;
    cancelAnimationFrame(typing);
    if (reduced) { node.textContent = text; return; }
    const t0 = performance.now(), GLYPHS = '0123456789/·+-';
    const tick = now => {
      const k = Math.min(1, (now - t0) / 240), n = Math.floor(text.length * k);
      node.textContent = text.slice(0, n) + text.slice(n).replace(/\S/g, () => GLYPHS[Math.random() * GLYPHS.length | 0]);
      if (k < 1) typing = requestAnimationFrame(tick);
    };
    typing = requestAnimationFrame(tick);
  }

  function paintHud() {
    const f = hoverFrame || lockFrame;
    typeTo(hudExif, f ? (exifLine(f) || f.title) : 'READY');
    hudFrame.textContent = `${pad(f ? f.no : 0)} / ${pad(total)}`;
    hud.classList.toggle('is-lock', !!f);
  }
  document.addEventListener('pointerover', e => {
    const t = e.target.closest && e.target.closest('[data-id]');
    const f = t ? byId.get(t.dataset.id) : null;
    if (f !== hoverFrame) { hoverFrame = f; paintHud(); }
  });
  paintHud();

  /* ---------------------------------------------------------- 01 · live view
     The opening screen behaves like a camera. The pointer is the focus point (it chases the
     pointer on a spring, so it hunts and settles like a lens), a click releases the shutter, and
     scrolling stops the lens down from f/1.4 to f/22 until the iris closes on the page. */
  const liveSec = $('#top'), live = $('#live'), hud2 = { s: $('#lcd-s'), f: $('#lcd-f'), af: $('#lcd-af'), left: $('#lcd-left') };
  const meter = $('#meter');
  meter.append(...['-3', '2', '1', '0', '1', '2', '+3'].map((t, i) => {
    const n = el('span', '', t);
    n.style.left = (i * 38) + 'px';
    return n;
  }));
  // Start on the frame with the most to focus on, then follow the featured order.
  const pool = featured.length ? featured : frames.slice(0, 9);
  const lead = pool.reduce((a, b) => ((b.detail || 0) > (a.detail || 0) ? b : a), pool[0]);
  const hero = [...pool.slice(pool.indexOf(lead)), ...pool.slice(0, pool.indexOf(lead))];
  const STOPS = [1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22];
  const SPEEDS = [8000, 4000, 2000, 1000, 500, 250, 125, 60, 30, 15, 8, 4, 2, 1, .5].map(d => 1 / d);
  const LIN = Array.from({ length: 256 }, (_, i) => Math.pow(i / 255, 2.2));
  const L = {
    W: 1, H: 1, R0: 1, fr: 160, s: 0, N: 1.4,
    x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,           // focus point, its velocity and its target
    movedAt: 0, locked: false, lock: 0, q: 1, po: 0, user: false,
    p: 0, on: true, open: reduced ? 1 : 0, introAt: 0, shutAt: 0, swapped: false,
    at: 0, left: total, taken: 0,
    meter: null, avg: .18, ar: 1.5, bokeh: [], name: { l: 0, r: 0, t: 0, b: 0 }, afRect: null,
  };

  const soft = new Image(), sharp = new Image();
  soft.alt = '';
  soft.decoding = sharp.decoding = 'async';
  sharp.sizes = '100vw';
  sharp.fetchPriority = 'high';
  $('#live-soft').append(soft);
  $('#live-sharp').append(sharp);
  const meterCanvas = document.createElement('canvas');
  const meterCtx = meterCanvas.getContext('2d', { willReadFrequently: true });

  function warm(f) { // fetch a frame ahead of time so the shutter never waits on the network
    const im = new Image();
    im.sizes = '100vw';
    im.srcset = f.src.map(([w, p]) => `${p} ${w}w`).join(', ');
  }

  function showHero(f) {
    sharp.srcset = f.src.map(([w, p]) => `${p} ${w}w`).join(', ');
    sharp.src = f.src[Math.min(1, f.src.length - 1)][1];
    sharp.alt = `${f.title}, from ${seriesById.get(f.series).title}`;
    soft.src = f.src[0][1];
    live.style.setProperty('--pk', f.peak ? `url("${new URL(f.peak, location.href).href}")` : 'none');
    live.style.setProperty('--tint', f.pal[0]);
    L.ar = f.w / f.h;
    L.bokeh = bokehFor(f);
    // the spot meter reads a tiny copy of the frame
    L.meter = null;
    const probe = new Image();
    probe.onload = () => {
      const w = 48, h = Math.max(3, Math.round(48 / L.ar));
      meterCanvas.width = w; meterCanvas.height = h;
      meterCtx.drawImage(probe, 0, 0, w, h);
      try {
        const d = meterCtx.getImageData(0, 0, w, h).data, lin = new Float32Array(w * h);
        let sum = 0;
        for (let i = 0; i < w * h; i++) {
          lin[i] = .2126 * LIN[d[i * 4]] + .7152 * LIN[d[i * 4 + 1]] + .0722 * LIN[d[i * 4 + 2]];
          sum += lin[i];
        }
        L.meter = { w, h, lin };
        L.avg = sum / (w * h) || .18;
      } catch (e) { /* an unreadable canvas only costs the meter */ }
    };
    probe.src = f.src[0][1];
    sharp.addEventListener('load', () => warm(hero[(L.at + 1) % hero.length]), { once: true });
  }

  function cover() { // where the frame sits on screen under object-fit: cover
    const w = Math.max(L.W, L.H * L.ar), h = w / L.ar;
    return { w, h, x: (L.W - w) / 2, y: (L.H - h) / 2 };
  }

  function spot(x, y) { // linear luminance around a point, 0..1
    const m = L.meter;
    if (!m) return L.avg;
    const c = cover();
    const cx = clamp(Math.round((x - c.x) / c.w * m.w), 1, m.w - 2), cy = clamp(Math.round((y - c.y) / c.h * m.h), 1, m.h - 2);
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += m.lin[(cy + dy) * m.w + cx + dx];
    return sum / 9;
  }

  // Bokeh grows from the frame's own highlights (found by build.py), topped up from its palette.
  function bokehFor(f) {
    let seed = f.no * 7919 + 13;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const pts = (f.hi || []).map(([u, v, c, l]) => ({ u, v, c, l }));
    for (let i = 0; pts.length < 8; i++) {
      pts.push({ u: rnd(), v: rnd(), c: f.pal[1 + i % Math.max(1, f.pal.length - 1)] || f.pal[0], l: .12 + rnd() * .22 });
    }
    return pts.map(b => {
      const n = parseInt(b.c.slice(1), 16);
      const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * .35)).join(',');
      return { ...b, rgb, z: .55 + rnd() * .9, ph: rnd() * 6.283 };
    });
  }

  const bokehCanvas = $('#live-bokeh'), bctx = bokehCanvas.getContext('2d');
  let dpr = 1;
  function drawBokeh(now, th) {
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, L.W, L.H);
    if (reduced || L.p > .85) return;
    const c = cover(), ap = Math.pow(1.4 / L.N, .8), poly = clamp(L.s / 4, 0, 1), base = Math.min(L.W, L.H) * .042;
    const seg = 2 * Math.PI / BLADES, k = Math.cos(Math.PI / BLADES);
    bctx.globalCompositeOperation = 'lighter';
    for (const b of L.bokeh) {
      const x = c.x + b.u * c.w + Math.sin(now / 2600 + b.ph) * 7;
      const y = c.y + b.v * c.h + Math.cos(now / 3300 + b.ph) * 5;
      if (x < -150 || x > L.W + 150 || y < -150 || y > L.H + 150) continue;
      // highlights near the focus point shrink back to points of light
      const blur = clamp((Math.hypot(x - L.x, y - L.y) - L.fr * .3) / (L.fr * 1.1), 0, 1);
      const r = base * (.6 + b.l * 1.5) * b.z * ap * blur * L.open;
      if (r < 2) continue;
      bctx.beginPath();
      // round wide open, and the shape of the aperture as it stops down
      for (let i = 0; i <= 42; i++) {
        const a = i / 42 * 2 * Math.PI;
        const m = (((a - th - seg / 2) % seg) + seg) % seg - seg / 2;
        const rr = r * (1 + poly * (k / Math.cos(m) - 1));
        bctx[i ? 'lineTo' : 'moveTo'](x + rr * Math.cos(a), y + rr * Math.sin(a));
      }
      const al = (.22 + b.l * .6) * (1 - L.p);
      const g = bctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${b.rgb},${(.07 * al).toFixed(3)})`);
      g.addColorStop(.75, `rgba(${b.rgb},${(.15 * al).toFixed(3)})`);
      g.addColorStop(.93, `rgba(${b.rgb},${(.34 * al).toFixed(3)})`);
      g.addColorStop(1, `rgba(${b.rgb},0)`);
      bctx.fillStyle = g;
      bctx.fill();
    }
  }

  // The iris: seven blades, each a wedge hinged on one edge of the opening.
  const iris = $('#live-iris'), SVG = 'http://www.w3.org/2000/svg';
  const blades = [0, 3, 1.2, 4.2, .6, 2.4, 5].map(pct => {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('fill', 'currentColor');
    path.style.fill = `color-mix(in oklab, var(--bg), var(--fg) ${pct}%)`;
    iris.append(path);
    return path;
  });
  function drawIris(R, th) {
    if (R >= L.R0 - .5) { iris.style.visibility = 'hidden'; return; }
    iris.style.visibility = '';
    R = Math.max(R, .6);
    const cx = L.W / 2, cy = L.H / 2, far = (L.W + L.H) * 3, V = [];
    for (let i = 0; i < BLADES; i++) {
      const a = th + i * 2 * Math.PI / BLADES;
      V.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    const f = v => v.toFixed(1);
    blades.forEach((path, i) => {
      const a = V[i], b = V[(i + 1) % BLADES], z = V[(i + BLADES - 1) % BLADES];
      const dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
      const px = a[0] - z[0], py = a[1] - z[1], pl = Math.hypot(px, py) || 1;
      path.setAttribute('d', `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}` +
        `L${f(b[0] + dx / dl * far)} ${f(b[1] + dy / dl * far)}L${f(a[0] + px / pl * far)} ${f(a[1] + py / pl * far)}Z`);
    });
  }

  // Autofocus points: a grid that lights up around the focus point and turns green on lock.
  const afBox = $('#live-af');
  let afPts = [];
  function layoutAf() {
    const cols = clamp(Math.round(L.W / 96), 5, 17), rows = clamp(Math.round(L.H / 96), 4, 11);
    afPts = [];
    const nodes = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const n = el('i'), u = c / (cols - 1), v = r / (rows - 1);
      n.style.left = u * 100 + '%';
      n.style.top = v * 100 + '%';
      nodes.push(n);
      afPts.push({ n, u, v, st: '' });
    }
    afBox.replaceChildren(...nodes);
    const a = afBox.getBoundingClientRect(), l = live.getBoundingClientRect();
    L.afRect = { x: a.left - l.left, y: a.top - l.top, w: a.width, h: a.height, cell: a.width / (cols - 1) };
  }
  function paintAf() {
    const A = L.afRect;
    let best = null, bd = Infinity;
    for (const p of afPts) {
      p.d = Math.hypot(A.x + p.u * A.w - L.x, A.y + p.v * A.h - L.y);
      if (p.d < bd) { bd = p.d; best = p; }
    }
    const reach = A.cell * (L.locked ? 1.5 : 1.1);
    for (const p of afPts) {
      const st = p === best && bd < A.cell ? (L.locked ? 'is-act is-lock' : 'is-act')
        : p.d < reach ? (L.locked ? 'is-lock' : 'is-lit') : '';
      if (st !== p.st) { p.n.className = st; p.st = st; }
    }
  }

  function sizeLive() {
    const r = live.getBoundingClientRect();
    L.W = r.width; L.H = r.height;
    L.R0 = Math.hypot(L.W, L.H) / 2 / Math.cos(Math.PI / BLADES) + 2;
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    bokehCanvas.width = Math.round(L.W * dpr);
    bokehCanvas.height = Math.round(L.H * dpr);
    iris.setAttribute('viewBox', `0 0 ${L.W} ${L.H}`);
    layoutAf();
    const n = $('#live-name').getBoundingClientRect();
    L.name = { l: n.left - r.left, r: n.right - r.left, t: n.top - r.top, b: n.bottom - r.top };
    kick();
  }

  function aim(x, y, user) {
    if (user) L.user = true;
    if (Math.abs(x - L.tx) + Math.abs(y - L.ty) < 1) return;
    L.tx = x; L.ty = y;
    L.movedAt = performance.now();
    if (L.locked) { L.locked = false; hud2.af.classList.remove('is-lock'); }
    kick();
  }

  let raf = 0, last = 0, readAt = 0;
  const kick = () => { if (!raf && L.on) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  function frame(now) {
    raf = 0;
    const dt = Math.min(.034, Math.max(.001, (now - last) / 1000));
    last = now;

    // intro: the iris opens, then autofocus hunts across the frame and settles on the name
    if (L.introAt) {
      const t = (now - L.introAt) / 1700;
      L.open = easeOut(clamp(t, 0, 1));
      if (!L.user) {
        if (t < .55) aim(L.W * .7, L.H * .36, false);
        else aim((L.name.l + L.name.r) / 2, (L.name.t + L.name.b) / 2, false);
      }
      if (t > 1.6) L.introAt = 0;
    }

    // focus point on a spring: slightly underdamped, so it overshoots and settles
    if (reduced) { L.x = L.tx; L.y = L.ty; L.vx = L.vy = 0; }
    else {
      L.vx += (150 * (L.tx - L.x) - 18 * L.vx) * dt;
      L.vy += (150 * (L.ty - L.y) - 18 * L.vy) * dt;
      L.x += L.vx * dt;
      L.y += L.vy * dt;
    }
    const speed = Math.hypot(L.vx, L.vy);
    if (!L.locked && now - L.movedAt > 360 && speed < 12 && L.open > .9 && L.p < .7) {
      L.locked = true;
      hud2.af.classList.add('is-lock');
      sfx('lock');
    }
    const hunting = speed > 40 || now - L.movedAt < 240;
    L.lock += ((L.locked ? 1 : 0) - L.lock) * Math.min(1, dt * 9);
    L.q += (clamp(1 - speed / 1600, .3, 1) - L.q) * Math.min(1, dt * 10);
    L.po += ((hunting && !reduced && L.p < .7 && L.open > .6 ? .95 : 0) - L.po) * Math.min(1, dt * (hunting ? 14 : 2.4));

    // stopping down: aperture from scroll, then the iris closes on the page
    L.s = clamp(L.p / .7, 0, 1) * 8;
    L.N = 1.4 * Math.pow(2, L.s / 2);
    const closing = clamp((L.p - .7) / .27, 0, 1);
    let shut = 1;
    if (L.shutAt) {
      const e = now - L.shutAt;
      if (e < 110) shut = 1 - easeIn(e / 110);
      else if (e < 170) { shut = 0; if (!L.swapped) { L.swapped = true; nextHero(); } }
      else if (e < 430) shut = easeOut((e - 170) / 260);
      else L.shutAt = 0;
    }
    const R = reduced ? L.R0 : L.R0 * Math.pow(1.4 / L.N, .55) * (1 - closing * closing) * L.open * shut;
    const th = -Math.PI / 2 + (1 - R / L.R0) * 1.15;
    drawIris(R, th);

    const minD = Math.min(L.W, L.H);
    L.fr = reduced ? L.W + L.H : minD * .17 * Math.pow(2, L.s * .56) * (.62 + .38 * L.q) * (1 + .22 * L.lock);
    const n = L.name;
    const nd = Math.hypot(Math.max(n.l - L.x, 0, L.x - n.r), Math.max(n.t - L.y, 0, L.y - n.b));
    const ca = reduced ? 0 : clamp((nd - L.fr * .3) / (L.fr + 260), 0, 1);
    const st = live.style;
    st.setProperty('--fx', L.x.toFixed(1) + 'px');
    st.setProperty('--fy', L.y.toFixed(1) + 'px');
    st.setProperty('--fr', L.fr.toFixed(1) + 'px');
    st.setProperty('--q', L.q.toFixed(3));
    st.setProperty('--po', L.po.toFixed(3));
    st.setProperty('--ca', ca.toFixed(3));
    drawBokeh(now, th);
    paintAf();

    // aperture priority: you choose the aperture (by scrolling), the camera meters and picks the shutter
    if (now - readAt > 90) {
      readAt = now;
      const lum = Math.max(spot(L.x, L.y), .0015);
      const t = L.N * L.N / Math.pow(2, 11.5 + Math.log2(lum / .18));
      const sp = SPEEDS.reduce((a, b) => Math.abs(Math.log2(b / t)) < Math.abs(Math.log2(a / t)) ? b : a);
      hud2.s.textContent = sp >= 1 ? sp + '"' : '1/' + Math.round(1 / sp);
      hud2.f.textContent = 'F' + STOPS[Math.round(L.s * 3)];
      hud2.left.textContent = `[${pad(L.left)}]`;
      meter.style.setProperty('--ev', clamp(Math.log2(lum / L.avg), -3, 3).toFixed(2));
    }

    if (L.on && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function nextHero() {
    L.at = (L.at + 1) % hero.length;
    showHero(hero[L.at]);
    L.left = L.left > 1 ? L.left - 1 : total;
    L.movedAt = performance.now(); // refocus on the new frame
    if (L.locked) { L.locked = false; hud2.af.classList.remove('is-lock'); }
  }

  // Each frame you take shrinks into a little stack of prints; the stack opens the last one.
  const roll = $('#live-roll'), rollN = $('#roll-n');
  function capture(f) {
    const print = new Image();
    print.alt = '';
    print.src = f.src[0][1];
    const rot = (Math.random() * 16 - 8).toFixed(1);
    print.style.transform = `rotate(${rot}deg)`;
    roll.append(print);
    $$('img', roll).slice(0, -3).forEach(n => n.remove());
    L.taken += 1;
    rollN.textContent = L.taken;
    roll.hidden = false;
    roll.dataset.open = f.id;
    roll.setAttribute('aria-label', `Open the last frame you took: ${f.title}`);
    if (reduced || !print.animate) return;
    const a = roll.getBoundingClientRect(), b = live.getBoundingClientRect();
    const sc = Math.max(b.width / a.width, b.height / a.height);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    print.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, borderWidth: '0px', opacity: 1 },
      { transform: `rotate(${rot}deg)`, borderWidth: '2px', opacity: 1 },
    ], { duration: 720, easing: 'cubic-bezier(.65, 0, .2, 1)' });
  }

  function shoot() {
    if (L.shutAt) return;
    sfx('shutter');
    capture(hero[L.at]);
    if (reduced) { nextHero(); return; }
    L.shutAt = performance.now();
    L.swapped = false;
    kick();
  }

  live.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const r = live.getBoundingClientRect();
    aim(e.clientX - r.left, e.clientY - r.top, true);
  });
  let downType = 'mouse';
  live.addEventListener('pointerdown', e => { downType = e.pointerType; });
  live.addEventListener('click', e => {
    if (e.target.closest('button, a')) return;
    const r = live.getBoundingClientRect();
    if (downType === 'touch') aim(e.clientX - r.left, e.clientY - r.top, true); // tap to focus, like a phone
    else shoot();
  });
  $('#live-shutter').addEventListener('click', shoot);
  if (!fine) $('#live-hint').innerHTML = 'Tap to focus <i>·</i> Scroll to stop down';

  function liveScroll(vh) {
    const r = liveSec.getBoundingClientRect();
    L.p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
    const on = r.bottom > 0;
    if (on !== L.on) { L.on = on; if (on) kick(); }
    live.style.setProperty('--p', L.p.toFixed(3));
    live.classList.toggle('is-deep', L.p > .3);
    root.classList.toggle('in-live', on && L.p < .4);
    hud.classList.toggle('is-live', on && L.p < .97);
    kick();
  }

  sizeLive();
  L.x = L.tx = L.W * .7;
  L.y = L.ty = L.H * .36;
  showHero(hero[0]);
  hud2.left.textContent = `[${pad(L.left)}]`;
  const begin = () => { if (!L.introAt && L.open < 1) { L.introAt = performance.now(); kick(); } };
  if (!reduced) {
    (sharp.decode ? sharp.decode() : Promise.resolve()).then(begin, begin);
    setTimeout(begin, 900);
  }
  let resizing = 0;
  addEventListener('resize', () => { cancelAnimationFrame(resizing); resizing = requestAnimationFrame(sizeLive); });
  if (document.fonts) document.fonts.ready.then(sizeLive);
  document.addEventListener('visibilitychange', kick);

  /* ---------------------------------------------------------- 01 · selected */
  const flow = $('#flow');
  const WIDE = [50, 42, 62, 46], TALL = [30, 26, 34, 28]; // vw, cycled so the column staggers
  const shots = featured.map((f, i) => {
    const fig = el('figure', 'shot');
    fig.dataset.id = f.id;
    fig.style.setProperty('--w', (f.w < f.h ? TALL : WIDE)[i % 4] + 'vw');
    const btn = el('button', 'shot__btn');
    btn.type = 'button';
    btn.dataset.open = f.id;
    btn.dataset.ctx = 'featured';
    btn.append(photo(f, '(max-width: 860px) 92vw, 62vw'));
    if (f.peak) {
      const pk = el('span', 'shot__peak');
      pk.style.setProperty('--pk', `url("${new URL(f.peak, location.href).href}")`);
      btn.append(pk);
    }
    const cap = el('figcaption');
    const left = el('span', '', pad(f.no) + '  ');
    left.append(el('b', '', f.title));
    cap.append(left, el('span', '', seriesById.get(f.series).title));
    fig.append(btn, cap);
    return fig;
  });
  flow.append(...shots);

  // Depth of field: a frame is sharp at the centre of the screen and softens away from it.
  let queued = false, locked = null;
  function pullFocus() {
    queued = false;
    const vh = innerHeight, mid = vh / 2;
    liveScroll(vh);
    let best = null, bestD = 0.2;
    for (const s of shots) {
      const r = s.getBoundingClientRect();
      if (r.bottom < -300 || r.top > vh + 300) continue;
      const d = Math.min(1, Math.abs(r.top + r.height / 2 - mid) / (vh * 0.62));
      // hold the frame sharp across a band, not only on one exact pixel
      s.style.setProperty('--d', (d < 0.18 ? 0 : (d - 0.18) / 0.82).toFixed(3));
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best !== locked) {
      if (locked) locked.classList.remove('is-lock');
      if (best) best.classList.add('is-lock');
      locked = best;
      lockFrame = best ? byId.get(best.dataset.id) : null;
      paintHud();
    }

    const max = document.documentElement.scrollHeight - vh;
    hudScale.style.setProperty('--turn', (clamp(scrollY / max, 0, 1) * (MARKS.length - 1) * PITCH).toFixed(1));
  }
  const requestPull = () => { if (!queued) { queued = true; requestAnimationFrame(pullFocus); } };
  addEventListener('scroll', requestPull, { passive: true });
  addEventListener('resize', requestPull);
  pullFocus();

  /* ---------------------------------------------------------- 02 · series */
  $('#rolls').append(...D.series.map((s, i) => {
    const li = el('li', 'roll'), a = el('a');
    a.href = '#/series/' + s.id;
    const name = el('span', 'roll__name', s.title);
    if (s.note) name.append(el('span', 'roll__note', s.note));
    const strip = el('span', 'roll__strip');
    strip.append(...frames.filter(f => f.series === s.id).slice(0, 5).map(f => photo(f, '140px', { alt: '' })));
    const meta = el('span', 'roll__meta');
    meta.append(el('b', '', `${s.count} frame${s.count === 1 ? '' : 's'}`), s.year || '');
    a.append(el('span', 'roll__no', String(i + 1).padStart(2, '0')), name, strip, meta);
    li.append(a);
    return li;
  }));

  /* ---------------------------------------------------------- 03 · archive */
  const grid = $('#grid'), chips = $('#chips'), views = $('#views'), more = $('#more');
  const SIZES = { frames: '(max-width: 860px) 46vw, 26vw', sheet: '150px', index: '64px' };
  const BATCH = 60; // frames added per step, so the page stays light however large the archive gets
  const state = { series: 'all', view: 'frames', list: frames, shown: 0 };

  function swap(change) {
    if (document.startViewTransition && !reduced) document.startViewTransition(change);
    else change();
  }

  function cell(f) {
    const b = el('button', 'cell');
    b.type = 'button';
    b.dataset.id = f.id;
    b.dataset.open = f.id;
    b.dataset.ctx = 'archive';
    b.style.setProperty('--ar', (f.w / f.h).toFixed(4));
    b.setAttribute('aria-label', `${f.title}, frame ${f.no}`);
    const wrap = el('span', 'cell__img');
    const im = photo(f, SIZES[state.view], { alt: '' });
    if (im.complete) im.classList.add('is-in');
    else im.addEventListener('load', () => im.classList.add('is-in'), { once: true });
    wrap.append(im);
    const meta = el('span', 'cell__meta');
    meta.append(
      el('span', 'cell__no', pad(f.no)),
      el('span', 'cell__t', f.title),
      el('span', 'cell__s', seriesById.get(f.series).title),
      el('span', 'cell__x', exifLine(f)),
      el('span', 'cell__d', f.date || f.place || ''));
    b.append(wrap, meta);
    return b;
  }

  // Adds batches while the end of the grid is near the screen; `first` forces one regardless.
  function fill(first) {
    while (state.shown < state.list.length
        && (first === true || more.getBoundingClientRect().top < innerHeight + 900)) {
      const next = state.list.slice(state.shown, state.shown + BATCH);
      grid.append(...next.map(cell));
      state.shown += next.length;
      first = false;
    }
  }
  new IntersectionObserver(fill, { rootMargin: '900px' }).observe(more);

  function setSeries(id) {
    state.series = seriesById.has(id) ? id : 'all';
    state.list = state.series === 'all' ? frames : frames.filter(f => f.series === state.series);
    state.shown = 0;
    grid.replaceChildren();
    $$('button', chips).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.series === state.series)));
    fill(true);
  }

  function setView(view) {
    state.view = view;
    grid.dataset.view = view;
    $$('img', grid).forEach(im => { im.sizes = SIZES[view]; });
    $$('button', views).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    fill();
  }

  chips.append(...[{ id: 'all', title: 'All', count: total }, ...D.series].map(s => {
    const b = el('button', '', s.title);
    b.type = 'button';
    b.dataset.series = s.id;
    b.append(el('sup', '', s.count));
    b.addEventListener('click', () => swap(() => setSeries(s.id)));
    return b;
  }));
  $$('button', views).forEach(b => b.addEventListener('click', () => swap(() => setView(b.dataset.view))));
  setSeries('all');

  /* ---------------------------------------------------------- 04 · develop */
  const cmp = $('#cmp'), cmpBar = $('#cmp-bar');
  function setSplit(pct) {
    const x = clamp(pct, 0, 100);
    cmp.style.setProperty('--x', x + '%');
    cmpBar.setAttribute('aria-valuenow', Math.round(x));
    cmpBar.setAttribute('aria-valuetext', `${Math.round(x)}% unedited`);
  }

  function dial(label, v) {
    const row = el('div', 'dial');
    const track = el('span', 'dial__track');
    const kelvin = label === 'Temp' && Math.abs(v) > 100;
    if (!kelvin && v !== 0) {
      const fillBar = el('span', 'dial__fill ' + (v > 0 ? 'is-pos' : 'is-neg'));
      fillBar.style.width = clamp(Math.abs(v) / (label === 'Exposure' ? 5 : 100), 0, 1) * 50 + '%';
      fillBar.style[v > 0 ? 'left' : 'right'] = '50%';
      track.append(fillBar);
    }
    const shown = kelvin ? v + ' K' : (v > 0 ? '+' : '') + (label === 'Exposure' ? v.toFixed(2) : v);
    const dd = el('dd', '', shown);
    const holder = el('dd');
    holder.append(track);
    row.append(el('dt', '', label), holder, dd);
    return row;
  }

  function showDev(f) {
    const sizes = '(max-width: 860px) 100vw, 70vw';
    cmp.style.setProperty('--ar', (f.w / f.h).toFixed(4));
    $('#cmp-after').replaceChildren(photo(f, sizes));
    $('#cmp-before').replaceChildren(photo(f, sizes, { raw: true }));
    cmp.dataset.id = f.id;
    $('#dev-no').textContent = `Frame ${pad(f.no)} · ${seriesById.get(f.series).title}`;
    $('#dev-title').textContent = f.title;
    $('#dev-meta').textContent = exifLine(f);
    const dials = $('#dev-dials');
    dials.replaceChildren(...(f.recipe || []).map(([label, v]) => dial(label, v)));
    dials.hidden = !(f.recipe && f.recipe.length);
    swatches($('#dev-pal'), f);
    $$('button', $('#dev-picker')).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dev === f.id)));
    cmp.classList.remove('is-sweeping');
    setSplit(50);
  }

  if (!devFrames.length) {
    $('#develop').hidden = true;
    $('.nav a[href="#develop"]').hidden = true;
  } else {
    $('#dev-picker').append(...devFrames.map(f => {
      const b = el('button');
      b.type = 'button';
      b.dataset.dev = f.id;
      b.dataset.id = f.id;
      b.setAttribute('aria-label', f.title);
      b.append(photo(f, '120px', { alt: '' }));
      b.addEventListener('click', () => swap(() => showDev(f)));
      return b;
    }));
    showDev(devFrames[0]);

    let dragging = false;
    const drag = e => {
      const r = cmp.getBoundingClientRect();
      setSplit((e.clientX - r.left) / r.width * 100);
    };
    cmp.addEventListener('pointerdown', e => {
      dragging = true;
      cmp.classList.remove('is-sweeping');
      cmp.setPointerCapture(e.pointerId);
      drag(e);
    });
    cmp.addEventListener('pointermove', e => { if (dragging) drag(e); });
    ['pointerup', 'pointercancel'].forEach(t => cmp.addEventListener(t, () => { dragging = false; }));
    cmpBar.addEventListener('keydown', e => {
      const now = Number(cmpBar.getAttribute('aria-valuenow'));
      const to = { ArrowLeft: now - 4, ArrowRight: now + 4, Home: 0, End: 100 }[e.key];
      if (to == null) return;
      e.preventDefault();
      setSplit(to);
    });

    // First time it scrolls into view: start on the RAW and sweep the grade in.
    if (!reduced) {
      setSplit(100);
      const once = new IntersectionObserver(es => {
        if (!es[0].isIntersecting) return;
        once.disconnect();
        cmp.classList.add('is-sweeping');
        setSplit(50);
        setTimeout(() => cmp.classList.remove('is-sweeping'), 1300);
      }, { threshold: 0.45 });
      once.observe(cmp);
    }
  }

  /* ---------------------------------------------------------- 05 · about */
  $('#about-text').append(...(site.about || []).map(p => el('p', '', p)));
  const facts = [
    ['Handle', site.handle && '@' + site.handle],
    ['Based in', site.based],
    ['Finished in', (site.tools || []).join(' + ')],
    ['Archive', `${total} frames, ${D.series.length} series`],
    ['Email', site.email],
  ].filter(([, v]) => v);
  $('#facts').append(...facts.map(([k, v]) => {
    const row = el('div');
    row.append(el('dt', '', k), el('dd', '', v));
    return row;
  }));
  const hello = $('#hello');
  if (site.email) {
    hello.href = 'mailto:' + site.email;
    hello.removeAttribute('target');
    $('#hello-at').textContent = site.email;
  } else if (site.instagram) {
    hello.href = site.instagram;
    $('#hello-at').textContent = 'Instagram · @' + (site.handle || '');
  } else {
    hello.hidden = true;
  }

  /* ---------------------------------------------------------- viewer */
  const viewer = $('#viewer'), vImg = $('#v-img'), vRaw = $('#v-raw');
  let ctx = frames, at = 0, pushed = false;

  function paintViewer(f) {
    const kids = [photo(f, '100vw', { eager: true })];
    if (f.raw) {
      const raw = photo(f, '100vw', { raw: true, eager: true });
      raw.classList.add('is-raw');
      kids.push(raw);
    }
    if (f.peak) {
      const pk = el('div', 'viewer__peak');
      pk.style.setProperty('--pk', `url("${new URL(f.peak, location.href).href}")`);
      kids.push(pk);
    }
    vImg.replaceChildren(...kids);
    viewer.classList.remove('is-raw');
    viewer.style.setProperty('--tint', f.pal[0]);
    $('#v-no').textContent = `${pad(f.no)} / ${pad(total)}`;
    $('#v-title').textContent = f.title;
    $('#v-sub').textContent = [seriesById.get(f.series).title, f.place, f.date].filter(Boolean).join('  ·  ');
    $('#v-exif').textContent = exifLine(f);
    swatches($('#v-pal'), f);
    vRaw.hidden = !f.raw;
    document.title = `${f.title} — ${site.handle || 'focus'}`;
  }

  // The viewer opens and closes through an aperture, centred where you clicked.
  function irisKeys(cx, cy) {
    const R = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) / Math.cos(Math.PI / BLADES) + 4;
    const keys = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, r = R * t, th = -Math.PI / 2 + (1 - t) * 1.3, pts = [];
      for (let i = 0; i < BLADES; i++) {
        const a = th + i * 2 * Math.PI / BLADES;
        pts.push(`${(cx + r * Math.cos(a)).toFixed(1)}px ${(cy + r * Math.sin(a)).toFixed(1)}px`);
      }
      keys.push({ clipPath: `polygon(${pts.join(', ')})` });
    }
    return keys;
  }

  let shutting = null;
  function openViewer(id, list, from) {
    const f = byId.get(id);
    if (!f) return false;
    ctx = list && list.includes(f) ? list : frames;
    at = ctx.indexOf(f);
    paintViewer(f);
    if (shutting) { shutting.cancel(); shutting = null; }
    if (!viewer.open) {
      viewer.showModal();
      if (!reduced && viewer.animate) {
        const o = from || { x: innerWidth / 2, y: innerHeight / 2 };
        viewer.animate(irisKeys(o.x, o.y), { duration: 680, easing: 'cubic-bezier(.3, .6, .2, 1)' });
      }
    }
    return true;
  }

  function shutViewer() {
    if (!viewer.open || shutting) return;
    if (reduced || !viewer.animate) { viewer.close(); return; }
    shutting = viewer.animate(irisKeys(innerWidth / 2, innerHeight / 2).reverse(),
      { duration: 380, easing: 'cubic-bezier(.55, 0, .8, .3)', fill: 'forwards' });
    shutting.onfinish = () => { const a = shutting; shutting = null; viewer.close(); a.cancel(); };
  }

  function step(dir) {
    at = (at + dir + ctx.length) % ctx.length;
    paintViewer(ctx[at]);
    history.replaceState(null, '', '#/f/' + ctx[at].id);
  }

  function closeViewer() {
    if (pushed) { history.back(); return; } // the hashchange that follows does the closing
    history.replaceState(null, '', location.pathname + location.search);
    shutViewer();
  }

  viewer.addEventListener('close', () => { document.title = baseTitle; pushed = false; });
  viewer.addEventListener('cancel', e => { e.preventDefault(); closeViewer(); });
  $('#v-close').addEventListener('click', closeViewer);
  $('#v-prev').addEventListener('click', () => step(-1));
  $('#v-next').addEventListener('click', () => step(1));
  viewer.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  const baseTitle = document.title;

  // swipe between frames
  let swipeX = null;
  vImg.addEventListener('pointerdown', e => { swipeX = e.clientX; });
  vImg.addEventListener('pointerup', e => {
    if (swipeX == null) return;
    const dx = e.clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
  });

  // hold to see the unedited frame
  const rawOn = () => viewer.classList.add('is-raw');
  const rawOff = () => viewer.classList.remove('is-raw');
  vRaw.addEventListener('pointerdown', e => { vRaw.setPointerCapture(e.pointerId); rawOn(); });
  ['pointerup', 'pointercancel', 'blur'].forEach(t => vRaw.addEventListener(t, rawOff));
  vRaw.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); rawOn(); } });
  vRaw.addEventListener('keyup', rawOff);

  const contexts = { featured: () => featured, archive: () => state.list };
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-open]');
    if (!t) return;
    const list = (contexts[t.dataset.ctx] || (() => frames))();
    const r = t.getBoundingClientRect();
    const from = e.detail ? { x: e.clientX, y: e.clientY } : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (openViewer(t.dataset.open, list, from)) {
      history.pushState(null, '', '#/f/' + t.dataset.open);
      pushed = true;
    }
  });

  /* ---------------------------------------------------------- routes: #/f/<frame>  #/series/<series> */
  function route() {
    const [, kind, id] = location.hash.match(/^#\/(f|series)\/(.+)$/) || [];
    if (kind === 'f') {
      if (!viewer.open || ctx[at].id !== id) openViewer(decodeURIComponent(id));
      return;
    }
    if (viewer.open) shutViewer();
    if (kind === 'series') {
      setSeries(decodeURIComponent(id));
      $('#archive').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    }
  }
  addEventListener('hashchange', route);
  route();

  /* ---------------------------------------------------------- chrome: lamp, sound, menu, nav, cursor */
  const LAMPS = { dark: ['Darkroom', '#0c0b0a'], light: ['Lightbox', '#efebe4'], safe: ['Safelight', '#120302'] };
  const lampLabel = $('#lamp-label');
  if (!LAMPS[root.dataset.theme]) root.dataset.theme = 'dark';
  const paintLamp = () => {
    const [label, color] = LAMPS[root.dataset.theme];
    lampLabel.textContent = label;
    $('meta[name="theme-color"]').content = color;
  };
  $('#lamp').addEventListener('click', () => {
    const order = Object.keys(LAMPS);
    root.dataset.theme = order[(order.indexOf(root.dataset.theme) + 1) % order.length];
    try { localStorage.setItem('lamp', root.dataset.theme); } catch (e) { /* private mode */ }
    paintLamp();
  });
  paintLamp();

  const soundBtn = $('#sound');
  const paintSound = () => {
    soundBtn.setAttribute('aria-pressed', String(sound.on));
    $('#sound-label').textContent = sound.on ? 'Sound on' : 'Sound off';
    soundBtn.setAttribute('aria-label', sound.on ? 'Turn camera sounds off' : 'Turn camera sounds on');
  };
  soundBtn.addEventListener('click', () => {
    sound.on = !sound.on;
    try { localStorage.setItem('sound', sound.on ? 'on' : 'off'); } catch (e) { /* private mode */ }
    paintSound();
    sfx('lock');
  });
  paintSound();

  const menu = $('#menu');
  const setMenu = open => {
    root.classList.toggle('nav-open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.textContent = open ? 'Close' : 'Menu';
  };
  menu.addEventListener('click', () => setMenu(!root.classList.contains('nav-open')));
  $('#nav').addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });

  const links = new Map($$('.nav a').map(a => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver(es => es.forEach(e => {
    const a = links.get(e.target.id);
    if (a) a.classList.toggle('is-here', e.isIntersecting);
  }), { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((a, id) => { const n = document.getElementById(id); if (n) spy.observe(n); });

  // Headings develop like prints the first time they come into view.
  if (!reduced && 'IntersectionObserver' in window) {
    root.classList.add('dev-ready');
    const tray = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-dev');
      tray.unobserve(e.target);
    }), { rootMargin: '0px 0px -12% 0px' });
    $$('.head h2, .about__line').forEach(n => tray.observe(n));
  }

  const af = $('#af');
  // A darkroom loupe over the contact sheet: whatever frame is under it, three times larger.
  const loupe = $('#loupe');
  let loupeOn = false;
  const hideLoupe = () => { if (loupeOn) { loupeOn = false; loupe.classList.remove('is-on'); } };
  if (fine && !reduced) {
    root.classList.add('has-loupe');
    const ZOOM = 3, HALF = 115;
    grid.addEventListener('pointermove', e => {
      const c = state.view === 'sheet' && e.target.closest('.cell');
      const f = c && byId.get(c.dataset.id);
      if (!f) { hideLoupe(); return; }
      const box = $('img', c).getBoundingClientRect(), ar = f.w / f.h;
      let w = box.width, h = w / ar;
      if (h > box.height) { h = box.height; w = h * ar; }
      const left = box.left + (box.width - w) / 2, top = box.top + (box.height - h) / 2;
      const url = f.src[Math.min(1, f.src.length - 1)][1];
      if (loupe.dataset.src !== url) {
        loupe.dataset.src = url;
        loupe.style.backgroundImage = `url("${new URL(url, location.href).href}")`;
        loupe.dataset.label = `${pad(f.no)}  ${f.title}`;
      }
      loupe.style.backgroundSize = `${(w * ZOOM).toFixed(1)}px ${(h * ZOOM).toFixed(1)}px`;
      loupe.style.backgroundPosition = `${(HALF - (e.clientX - left) * ZOOM).toFixed(1)}px ${(HALF - (e.clientY - top) * ZOOM).toFixed(1)}px`;
      loupe.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      if (!loupeOn) { loupeOn = true; loupe.classList.add('is-on'); }
    });
    grid.addEventListener('pointerleave', hideLoupe);
    addEventListener('scroll', hideLoupe, { passive: true });
  }

  if (fine && !reduced) {
    let x = 0, y = 0, tx = 0, ty = 0, raf = 0, placed = false;
    const tick = () => {
      x += (tx - x) * 0.24;
      y += (ty - y) * 0.24;
      af.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(tick) : 0;
    };
    addEventListener('pointermove', e => {
      tx = e.clientX; ty = e.clientY;
      if (!placed) { x = tx; y = ty; placed = true; }
      // the live view draws its own focus point, and the loupe replaces the cursor on the sheet
      af.classList.toggle('is-on', !loupeOn && !e.target.closest('.live__pin'));
      af.classList.toggle('is-lock', !!e.target.closest('[data-open], .cmp'));
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => af.classList.remove('is-on'));
  }
})();
