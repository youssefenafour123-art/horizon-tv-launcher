/* Live wallpaper: a painted landscape whose sky follows the real sun and moon for your location.
   Dawn, sunrise, morning, noon, afternoon, golden hour, sunset, dusk, night — all blended continuously.
   Static layers are cached and re-painted every few seconds; only stars, clouds, sun, moon and birds move per frame (30 fps).
   Photo mode: drop wallpapers/<phase>.jpg (dawn, sunrise, morning, noon, afternoon, sunset, dusk, night) and they take over.
   Keys: T = time-lapse a whole day in one minute. */
window.TV = window.TV || {};

(function () {
  const W = 1920, H = 1080, R = Math.PI / 180;
  let cv, ctx, scene = 'dunes', sky = null, landCache, skyCache, lastSky = 0, lastLand = 0, t0 = performance.now();
  let lapse = null; // { real: ms, virt: ms, rate }
  let mode = 'live', dirty = true;
  const SKY = .5; // sky render scale
  const showCanvas = v => { cv.style.opacity = v; document.body.classList.toggle('scrim-baked', !!v); };
  const FRAME = window.Horizon ? 66 : 32;
  let busyUntil = 0;
  document.addEventListener('keydown', () => { busyUntil = performance.now() + 650; }, true);

  /* ---------- utils ---------- */
  const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = t => t * t * (3 - 2 * t);

  /* ---------- astronomy ---------- */
  function sunMoon(date, lat, lng) {
    const d = date.getTime() / 864e5 - 10957.5;
    const e = (23.439 - 0.00000036 * d) * R;
    const g = (357.529 + 0.98560028 * d) * R, q = 280.459 + 0.98564736 * d;
    const sunLon = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * R;
    const gmst = (280.46061837 + 360.98564736629 * d) % 360;
    const altAz = (ra, dec) => {
      const H = (gmst + lng) * R - ra, la = lat * R;
      const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
      const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(la) - Math.tan(dec) * Math.cos(la)) + Math.PI;
      return { alt: alt / R, az: ((az / R) % 360 + 360) % 360 };
    };
    const eq = (lon, b) => ({
      ra: Math.atan2(Math.sin(lon) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(lon)),
      dec: Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(lon)),
    });
    const s = eq(sunLon, 0);
    const L = (218.316 + 13.176396 * d) * R, M = (134.963 + 13.064993 * d) * R, F = (93.272 + 13.229350 * d) * R;
    const moonLon = L + 6.289 * R * Math.sin(M), moonLat = 5.128 * R * Math.sin(F);
    const m = eq(moonLon, moonLat);
    const elong = moonLon - sunLon;
    return { sun: altAz(s.ra, s.dec), moon: altAz(m.ra, m.dec), phase: (1 - Math.cos(elong)) / 2, waxing: Math.sin(elong) > 0 };
  }

  /* ---------- sky palettes keyed by sun altitude (z=zenith u=upper h=horizon g=sun glow n=near land s=stars) ---------- */
  const K = (a, z, u, h, g, n, s) => ({ a, z: hex(z), u: hex(u), h: hex(h), g: hex(g), n: hex(n), s });
  const MORNING = [
    K(-18, '#040817', '#0c1634', '#22305c', '#2a3a70', '#05070f', 1),
    K(-12, '#07102a', '#13224c', '#2e3d72', '#3a4a86', '#070a18', .85),
    K(-7,  '#0f1a42', '#2a3a78', '#7a6aa0', '#a07ab0', '#0d1030', .45),
    K(-3,  '#1d3170', '#4f63a8', '#e3a3a8', '#ffb490', '#1e1838', .1),
    K(0,   '#2f4a90', '#7a8fc8', '#ffc9a0', '#ffd2a0', '#2a2440', 0),
    K(4,   '#3b62b0', '#8eaedc', '#ffe2c0', '#fff0d8', '#2c3448', 0),
    K(12,  '#3a70c4', '#86b4e8', '#dceaf5', '#ffffff', '#263a50', 0),
    K(30,  '#2b68cc', '#6aa6ee', '#c4def4', '#ffffff', '#22394f', 0),
    K(60,  '#2260cc', '#5c9cea', '#b6d6f2', '#ffffff', '#1f364c', 0),
  ];
  const EVENING = [
    MORNING[0],
    K(-12, '#08102a', '#182050', '#3a2e66', '#4a3670', '#08081a', .85),
    K(-7,  '#141a48', '#3b2f6e', '#b0507a', '#d0607a', '#140f2c', .45),
    K(-3,  '#232f6c', '#6a4a8a', '#ff7a5a', '#ff6a40', '#24142c', .1),
    K(0,   '#2d3f80', '#8a6a9a', '#ff9a5a', '#ff8a3a', '#2e1a2c', 0),
    K(4,   '#3a5aa4', '#a08cb0', '#ffc080', '#ffb050', '#33283a', 0),
    K(12,  '#3a6cbc', '#8ab0e0', '#f0dcc0', '#fff0d0', '#2a3548', 0),
    MORNING[7], MORNING[8],
  ];
  function palette(alt, evening) {
    const sample = keys => {
      if (alt <= keys[0].a) return keys[0];
      for (let i = 1; i < keys.length; i++) if (alt <= keys[i].a) {
        const A = keys[i - 1], B = keys[i], t = smooth((alt - A.a) / (B.a - A.a));
        return { z: mix(A.z, B.z, t), u: mix(A.u, B.u, t), h: mix(A.h, B.h, t), g: mix(A.g, B.g, t), n: mix(A.n, B.n, t), s: A.s + (B.s - A.s) * t };
      }
      return keys[keys.length - 1];
    };
    const m = sample(MORNING), e = sample(EVENING), t = evening;
    return { z: mix(m.z, e.z, t), u: mix(m.u, e.u, t), h: mix(m.h, e.h, t), g: mix(m.g, e.g, t), n: mix(m.n, e.n, t), s: m.s + (e.s - m.s) * t };
  }

  function phaseOf(alt, evening) {
    if (alt < -12) return 'night';
    if (!evening) return alt < -4 ? 'dawn' : alt < 6 ? 'sunrise' : alt < 30 ? 'morning' : 'noon';
    return alt < -4 ? 'dusk' : alt < 2 ? 'sunset' : alt < 12 ? 'golden' : alt < 30 ? 'afternoon' : 'noon';
  }

  /* ---------- noise for terrain ---------- */
  function noise(seed) {
    const r = rng(seed), v = Array.from({ length: 512 }, r);
    const n = x => { const i = Math.floor(x), f = x - i, a = v[i & 511], b = v[(i + 1) & 511]; return a + (b - a) * smooth(f); };
    return (x, oct = 4, ridged = false) => { let s = 0, amp = .5, fr = 1; for (let o = 0; o < oct; o++) { let k = n(x * fr + o * 31.7); if (ridged) k = 1 - Math.abs(k * 2 - 1); s += k * amp; amp *= .5; fr *= 2.03; } return s; };
  }
  const line = (f, step = 6) => { const p = []; for (let x = -20; x <= W + 20; x += step) p.push([x, f(x)]); return p; };
  function fillLine(c, pts, color, bottom = H) {
    c.beginPath(); c.moveTo(pts[0][0], bottom);
    for (const [x, y] of pts) c.lineTo(x, y);
    c.lineTo(pts[pts.length - 1][0], bottom); c.closePath(); c.fillStyle = color; c.fill();
  }

  /* ---------- silhouettes ---------- */
  function mosque(c, x, gy, s, color) {
    c.fillStyle = color; c.save(); c.translate(x, gy); c.scale(s, s);
    c.fillRect(-130, -64, 260, 64);                       // prayer hall
    c.fillRect(-60, -92, 120, 30);                         // drum
    c.beginPath(); c.moveTo(-58, -92); c.bezierCurveTo(-60, -150, -8, -170, 0, -192); c.bezierCurveTo(8, -170, 60, -150, 58, -92); c.fill(); // onion dome
    c.fillRect(-1.5, -212, 3, 22); c.beginPath(); c.arc(0, -214, 5, 0, 7); c.fill();
    for (const dx of [-100, 100]) { c.beginPath(); c.arc(dx, -64, 22, Math.PI, 0); c.fill(); }
    // square Maghrebi minaret
    c.fillRect(150, -300, 46, 300); c.fillRect(144, -308, 58, 12);
    c.fillRect(158, -352, 30, 44); c.beginPath(); c.arc(173, -352, 15, Math.PI, 0); c.fill();
    c.fillRect(171.5, -388, 3, 22); c.beginPath(); c.arc(173, -392, 4, 0, 7); c.fill();
    c.restore();
  }
  function palm(c, x, gy, h, lean, color) {
    c.strokeStyle = color; c.fillStyle = color; c.lineCap = 'round';
    const tx = x + lean, ty = gy - h;
    c.lineWidth = h * .045; c.beginPath(); c.moveTo(x, gy); c.quadraticCurveTo(x + lean * .2, gy - h * .5, tx, ty); c.stroke();
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * .38 + (i % 2 ? .1 : -.1), len = h * (.42 + (i % 3) * .07);
      const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * .55 + len * .32;
      c.lineWidth = h * .02;
      c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * len * .5, ty + Math.sin(a) * len * .5 - h * .05, ex, ey); c.stroke();
      c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * len * .55, ty + Math.sin(a) * len * .55 + h * .02, ex, ey); c.lineTo(ex, ey); c.stroke();
    }
  }

  // square Maghrebi minaret with its lantern and the three golden balls (jamour): Koutoubia, Hassan II
  function minaret(c, x, gy, w, h, color) {
    c.fillStyle = color;
    c.fillRect(x - w / 2, gy - h, w, h);                                   // shaft
    c.fillRect(x - w / 2 - w * .06, gy - h - w * .08, w * 1.12, w * .1);   // cornice
    for (let i = 0; i < 5; i++) c.fillRect(x - w / 2 + i * w / 4.6, gy - h - w * .2, w * .12, w * .12); // merlons
    const lw = w * .42, lh = w * .62;
    c.fillRect(x - lw / 2, gy - h - lh, lw, lh);                           // lantern
    c.beginPath(); c.arc(x, gy - h - lh, lw / 2, Math.PI, 0); c.fill();     // its little dome
    c.fillRect(x - w * .015, gy - h - lh - lw * .5 - w * .5, w * .03, w * .5);
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x, gy - h - lh - lw * .5 - w * (.1 + i * .14), w * (.05 - i * .01), 0, 7); c.fill(); }
  }
  // earthen kasbah tower: slightly tapered, crenellated corners
  function tower(c, x, gy, w, h, color) {
    c.fillStyle = color;
    c.beginPath(); c.moveTo(x - w / 2, gy); c.lineTo(x - w * .43, gy - h); c.lineTo(x + w * .43, gy - h); c.lineTo(x + w / 2, gy); c.fill();
    for (let i = 0; i < 4; i++) c.fillRect(x - w * .43 + i * w * .26, gy - h - w * .14, w * .12, w * .15);
  }
  function camel(c, x, gy, s, color) {
    c.fillStyle = color; c.strokeStyle = color; c.lineCap = 'round'; c.save(); c.translate(x, gy); c.scale(s, s);
    c.beginPath(); c.ellipse(0, -62, 34, 16, 0, 0, 7); c.fill();                               // body
    c.beginPath(); c.ellipse(-4, -76, 16, 14, 0, Math.PI, 0); c.fill();                          // hump
    c.lineWidth = 7; c.beginPath(); c.moveTo(28, -66); c.quadraticCurveTo(46, -76, 44, -96); c.stroke(); // neck
    c.beginPath(); c.ellipse(50, -98, 10, 6, .3, 0, 7); c.fill();                                // head
    c.lineWidth = 5; for (const lx of [-24, -14, 16, 26]) { c.beginPath(); c.moveTo(lx, -54); c.lineTo(lx + (lx > 0 ? 3 : -3), 0); c.stroke(); }
    c.lineWidth = 3; c.beginPath(); c.moveTo(-34, -64); c.quadraticCurveTo(-44, -52, -40, -40); c.stroke(); // tail
    c.restore();
  }

  /* ---------- scenes: each paints layers far→near, colored from horizon → near (atmospheric perspective) ---------- */
  const SCENES = {
    dunes: { name: 'Sahara', horizon: 700, paint(c, p, night) {
      const n1 = noise(7), sand = hex('#b0683a');
      const day = clamp(1 - night * 1.4, 0, 1);
      const near = mix(p.n, sand, .55 * day);
      const col = k => css(mix(p.h, near, k));
      const dune = (y0, amp, per, ph, sk) => x => { const t = ((x / per + ph) % 1 + 1) % 1; const crest = t < sk ? Math.pow(t / sk, 1.6) : Math.pow((1 - t) / (1 - sk), 1.1); return y0 - amp * crest - n1(x / 300) * amp * .3; };
      fillLine(c, line(dune(700, 70, 900, .1, .7)), col(.28));
      mosque(c, 1020, 668, .58, col(.42));
      palm(c, 860, 676, 120, 10, col(.42)); palm(c, 900, 680, 90, -12, col(.42)); palm(c, 1240, 676, 105, -8, col(.42));
      fillLine(c, line(dune(790, 110, 1300, .45, .65)), col(.55));
      fillLine(c, line(dune(900, 140, 1700, .8, .6)), col(.78));
      fillLine(c, line(dune(1010, 150, 2300, .25, .72)), col(1));
      palm(c, 160, 1000, 330, 40, col(1)); palm(c, 300, 1010, 230, -30, col(1));
    } },
    atlas: { name: 'Atlas lake', horizon: 640, water: 760, paint(c, p, night) {
      const n1 = noise(21), n2 = noise(5), n3 = noise(13);
      const day = clamp(1 - night * 1.4, 0, 1);
      const near = mix(p.n, hex('#1f4a42'), .55 * day);
      const haze = mix(p.h, mix(p.u, hex('#7aa0c8'), .4), .55 * day);
      const col = k => css(mix(haze, near, k));
      // far range: peaks catch the light, valleys sink into haze
      const far = line(x => 640 - 270 * n1(x / 520, 5, true) + 50);
      const gr = c.createLinearGradient(0, 380, 0, 700);
      gr.addColorStop(0, css(mix(mix(haze, near, .2), mix(p.g, [255, 255, 255], .5), .22 * day + .12)));
      gr.addColorStop(1, col(.3));
      fillLine(c, far, gr, 762);
      fillLine(c, line(x => 720 - 150 * n2(x / 380, 4, true) + 24), col(.52), 762);
      mosque(c, 1010, 764, .5, col(.68));
      palm(c, 880, 764, 90, 8, col(.68)); palm(c, 1150, 764, 76, -8, col(.68));
      fillLine(c, line(x => 763 - 10 * n3(x / 90)), col(.68), 766);
    }, fore(c, p) {
      const col = css(mix(p.h, p.n, 1));
      const n4 = noise(3);
      fillLine(c, line(x => x < 700 ? 930 + (x / 700) ** 2 * 200 - 50 * n4(x / 160) : 1200), col);
      palm(c, 560, 990, 250, 30, col); palm(c, 80, 950, 300, -20, col); palm(c, 300, 960, 200, 14, col);
      fillLine(c, line(x => x > 1360 ? 1080 - ((x - 1360) / 560) * 130 - 40 * n4(x / 120) : 1200), col);
      palm(c, 1800, 975, 270, -40, col);
    } },
    coast: { name: 'Essaouira coast', horizon: 704, water: 704, paint(c, p, night, lights) {
      const n1 = noise(31), r = rng(8);
      const col = k => css(mix(p.h, p.n, k));
      fillLine(c, line(x => x > 1180 && x < 1560 ? 704 - 46 * Math.sin((x - 1180) / 380 * Math.PI) * (.8 + .2 * n1(x / 40)) : 760), col(.35), 706); // Mogador island
      // ramparts on the promontory, left
      c.fillStyle = col(.62);
      c.beginPath(); c.moveTo(-20, 1080); c.lineTo(-20, 650); c.lineTo(560, 650); c.lineTo(700, 720); c.lineTo(760, 1080); c.fill();
      for (let x = -10; x < 560; x += 18) c.fillRect(x, 640, 10, 12);
      for (const [x, h] of [[60, 70], [250, 54], [430, 80]]) { c.fillRect(x, 650 - h, 70, h + 2); for (let i = 0; i < 70; i += 16) c.fillRect(x + i, 650 - h - 10, 9, 10); }
      c.fillRect(300, 470, 38, 182); c.fillRect(294, 462, 50, 10); c.fillRect(306, 432, 26, 32); c.beginPath(); c.arc(319, 432, 13, Math.PI, 0); c.fill();
      for (let i = 0; i < 26; i++) lights.push([20 + r() * 520, 670 + r() * 60, 5, 6, .4 + r() * .6]);
      palm(c, 640, 724, 150, 18, col(.62));
    }, fore(c, p) {
      const col = css(mix(p.h, p.n, 1)), n4 = noise(17);
      fillLine(c, line(x => x > 1320 ? 1080 - ((x - 1320) / 600) * 240 - 60 * n4(x / 70) : 1300), col);
      fillLine(c, line(x => x < 520 ? 1000 + (x / 520) * 90 - 40 * n4(x / 50 + 9) : 1300), col);
    } },
    hills: { name: 'Rolling hills', horizon: 720, paint(c, p, night) {
      const n1 = noise(44), n2 = noise(45), n3 = noise(46), n4 = noise(47);
      const day = clamp(1 - night * 1.4, 0, 1);
      const near = mix(p.n, hex('#2f5a2a'), .78 * day);
      const haze = mix(p.h, mix(p.u, hex('#8fb4d8'), .4), .5 * day);
      const col = k => css(mix(haze, near, k));
      fillLine(c, line(x => 690 - 70 * n1(x / 700)), col(.3));
      mosque(c, 1380, 668, .34, col(.25));
      fillLine(c, line(x => 760 - 90 * n2(x / 520)), col(.48));
      fillLine(c, line(x => 860 - 110 * n3(x / 460)), col(.72));
      const ground = x => 980 - 120 * n4(x / 380);
      fillLine(c, line(ground), col(1));
      // a lone tree on the near crest
      const tx = 1500, ty = ground(tx) + 4; c.fillStyle = col(1); c.strokeStyle = col(1);
      c.lineWidth = 12; c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + 4, ty - 120); c.stroke();
      for (const [dx, dy, rr] of [[0, -150, 70], [-60, -120, 52], [60, -118, 56], [-30, -190, 50], [36, -186, 48]]) { c.beginPath(); c.arc(tx + dx, ty + dy, rr, 0, 7); c.fill(); }
    } },
    medina: { name: 'Medina', horizon: 770, paint(c, p, night, lights) {
      const r = rng(42), n1 = noise(9);
      const col = k => css(mix(p.h, p.n, k));
      fillLine(c, line(x => 700 - 90 * n1(x / 600, 3)), col(.22));
      const row = (base, minH, maxH, k, lit) => {
        let x = -30; c.fillStyle = col(k);
        while (x < W + 30) {
          const w = 40 + r() * 90, h = minH + r() * (maxH - minH);
          c.fillRect(x, base - h, w + 1, h + 200);
          if (r() < .35) for (let i = 0; i < w; i += 12) c.fillRect(x + i, base - h - 6, 6, 6); // crenellation
          if (lit) for (let wy = base - h + 14; wy < base - 10; wy += 22) for (let wx = x + 8; wx < x + w - 10; wx += 20) if (r() < .18) lights.push([wx, wy, 6 + r() * 4, 7, .5 + r() * .5]);
          x += w;
        }
      };
      row(760, 20, 90, .42, false);
      mosque(c, 1240, 760, 1.05, col(.5));
      row(840, 40, 120, .68, true);
      palm(c, 300, 850, 260, 20, col(.78)); palm(c, 1650, 860, 230, -25, col(.78));
      row(960, 70, 170, .88, true);
      c.fillStyle = col(1); c.fillRect(0, 1000, W, 80);
    } },

    /* ---------- more of Morocco ---------- */
    kasbah: { name: 'Aït Benhaddou', horizon: 690, water: 905, paint(c, p, night, lights) {
      const n1 = noise(71), n2 = noise(72), r = rng(73);
      const day = clamp(1 - night * 1.4, 0, 1);
      const earth = mix(p.n, hex('#a65a32'), .6 * day), green = mix(p.n, hex('#2e4a2a'), .6 * day);
      const col = (k, base = earth) => css(mix(p.h, base, k));
      fillLine(c, line(x => 680 - 120 * n1(x / 700, 4, true) + 20), col(.28));           // far ridge
      // the ksar on its hill, the granary (agadir) on top
      const hill = x => 900 - 300 * Math.exp(-(((x - 980) / 330) ** 2)) - 18 * n2(x / 60);
      fillLine(c, line(hill, 4), col(.6), 910);
      const ks = [[700, 54, 90], [770, 46, 70], [830, 60, 120], [900, 44, 80], [960, 70, 150], [1040, 50, 110], [1100, 62, 130], [1170, 48, 90], [1240, 56, 100], [1310, 44, 70]];
      for (const [x, w, h] of ks) {
        const gy = hill(x) + 30;
        tower(c, x, gy, w, h, col(.68));
        for (let wy = gy - h + 18; wy < gy - 10; wy += 26) if (r() < .5) lights.push([x - 4, wy, 7, 9, .5 + r() * .5]);
      }
      c.fillStyle = col(.62); c.fillRect(930, hill(980) - 40, 110, 50); for (let i = 0; i < 110; i += 18) c.fillRect(930 + i, hill(980) - 52, 10, 12);
      // oasis along the river
      fillLine(c, line(x => 900 - 14 * n2(x / 40)), col(.82, green), 906);
      for (const [x, h, l] of [[140, 150, 10], [260, 120, -8], [420, 170, 14], [560, 110, -6], [1420, 160, -10], [1560, 130, 8], [1700, 175, -14], [1840, 120, 6]]) palm(c, x, 906, h, l, col(.82, green));
    }, fore(c, p) {
      const col = css(mix(p.h, p.n, 1)), n4 = noise(74);
      fillLine(c, line(x => 1050 - 24 * n4(x / 90)), col);
      palm(c, 90, 1060, 320, 30, col); palm(c, 1830, 1060, 280, -26, col);
    } },
    koutoubia: { name: 'Marrakech · Koutoubia', horizon: 660, paint(c, p, night, lights) {
      const n1 = noise(91), n2 = noise(92), r = rng(93);
      const day = clamp(1 - night * 1.4, 0, 1);
      const ochre = mix(p.n, hex('#b0563a'), .62 * day), palmc = mix(p.n, hex('#2c3f2a'), .6 * day);
      const col = (k, base = ochre) => css(mix(p.h, base, k));
      // the snowy High Atlas behind the city
      const atlas = line(x => 560 - 250 * n1(x / 600, 5, true) + 60);
      const snow = c.createLinearGradient(0, 330, 0, 620);
      snow.addColorStop(0, css(mix(mix(p.h, [255, 255, 255], .75 * day + .1), p.g, .2)));
      snow.addColorStop(.45, css(mix(p.h, mix(p.u, [200, 210, 230], .3), .55)));
      snow.addColorStop(1, col(.2));
      fillLine(c, atlas, snow, 760);
      // the palmeraie
      for (let i = 0; i < 26; i++) palm(c, -20 + i * 78 + r() * 30, 790 + r() * 20, 90 + r() * 70, (r() - .5) * 30, col(.55, palmc));
      fillLine(c, line(x => 800 - 8 * n2(x / 50)), col(.55, palmc), 806);
      minaret(c, 760, 800, 96, 360, col(.7));                                           // Koutoubia
      c.fillStyle = col(.7); c.fillRect(812, 760, 300, 42);
      // the ochre ramparts with a gate
      c.fillStyle = col(.9);
      c.fillRect(-20, 870, W + 40, 220);
      for (let x = -10; x < W; x += 34) c.fillRect(x, 852, 20, 20);
      for (const tx of [240, 620, 1300, 1680]) { c.fillRect(tx, 830, 80, 60); for (let i = 0; i < 80; i += 22) c.fillRect(tx + i, 814, 14, 18); }
      c.fillStyle = col(1); c.fillRect(-20, 1010, W + 40, 80);
      // Bab: a horseshoe arch, lit from inside at night
      c.fillStyle = css(mix(p.h, mix(p.n, [20, 14, 10], .6), .9));
      c.beginPath(); c.moveTo(905, 1010); c.lineTo(905, 940); c.arc(960, 940, 55, Math.PI, 0); c.lineTo(1015, 1010); c.fill();
      lights.push([915, 930, 90, 80, .55]);
    } },
    erg: { name: 'Merzouga caravan', horizon: 720, paint(c, p, night) {
      const n1 = noise(101);
      const day = clamp(1 - night * 1.4, 0, 1);
      const sand = mix(p.n, hex('#c0662e'), .62 * day);
      const col = k => css(mix(p.h, sand, k));
      const dune = (y0, amp, per, ph, sk) => x => { const t = ((x / per + ph) % 1 + 1) % 1; const crest = t < sk ? Math.pow(t / sk, 1.7) : Math.pow((1 - t) / (1 - sk), 1.15); return y0 - amp * crest - n1(x / 260) * amp * .25; };
      fillLine(c, line(dune(720, 140, 1500, .2, .62)), col(.3));                       // Erg Chebbi's big dunes
      const crest = dune(830, 170, 2000, .55, .58);
      fillLine(c, line(crest), col(.58));
      // a caravan walking the crest
      for (let i = 0; i < 6; i++) { const x = 760 + i * 92; camel(c, x, crest(x) + 4, .9 - i * .03, col(.58)); }
      c.strokeStyle = col(.58); c.lineWidth = 2; c.beginPath(); for (let i = 0; i < 6; i++) { const x = 760 + i * 92; c.lineTo(x + 46, crest(x + 46) - 92); } c.stroke();
      // a Berber tent at the foot of the dune
      c.fillStyle = col(.8);
      c.beginPath(); c.moveTo(220, 930); c.lineTo(300, 872); c.lineTo(440, 866); c.lineTo(520, 930); c.fill();
      fillLine(c, line(dune(960, 120, 2400, .9, .66)), col(.8));
      fillLine(c, line(dune(1060, 130, 3000, .3, .7)), col(1));
    } },
  };
  for (const k in SCENES) SCENES[k].kind = 'painted';
  const aiReady = new Set();       // which AI paintings you have added (checked once at start)
  let credits = {};                // photographer + license for each real photo

  let photoReq = 0, landDirty = true;
  function paintPhoto(sc) {
    const req = ++photoReq, img = new Image();
    img.src = sc.src;
    (img.decode ? img.decode() : new Promise((ok, no) => { img.onload = ok; img.onerror = no; })).then(() => {
      if (req !== photoReq || asleep || SCENES[scene] !== sc) return;
      const c = landCache.getContext('2d');
      c.globalCompositeOperation = 'source-over';
      c.drawImage(img, 0, 0, W, H);                                   // 2560×1440 → the 1920×1080 still layer, as taken
      paintScrim(c);
      img.src = '';                                                   // let the decoded photo go
      landDirty = true;
    }).catch(() => { if (req === photoReq) console.log('HZSKY photo missing ' + sc.src); });
  }

  /* ---------- photo scenes: real photos of Morocco and your AI paintings, with the light of the real time of day ----------
     Each image is 2560×1440 in wallpapers/photos or wallpapers/ai. It is decoded only to repaint the still layer
     (when the light changes), then released, so it costs no memory or frames in between. */
  const WALL = '../wallpapers/';
  // [file, name, time of day it was taken: morning · noon · evening · night]
  const PHOTOS = [
    ['chaouen-town', 'Chefchaouen', 'morning'],
    ['erg-camels', 'Erg Chebbi · caravan', 'morning'],
    ['rif', 'Rif valley', 'morning'],
    ['merzouga-sunrise', 'Merzouga · sunrise', 'morning'],
    ['erg-sunrise', 'Erg Chebbi · sunrise', 'morning'],
    ['sahara-morning', 'Sahara · morning', 'morning'],
    ['pink-sunrise', 'Sunrise · Souss coast', 'morning'],
    ['poplar-valley', 'Poplar valley · morning', 'morning'],
    ['chaouen-stairs', 'Chefchaouen · blue stairs', 'noon'],
    ['koutoubia', 'Koutoubia · Marrakech', 'noon'],
    ['benhaddou', 'Aït Benhaddou', 'noon'],
    ['essaouira', 'Essaouira', 'noon'],
    ['fes', 'Fes medina', 'noon'],
    ['oudayas', 'Kasbah of the Oudayas · Rabat', 'noon'],
    ['todgha', 'Todgha Gorge', 'noon'],
    ['atlas-snow', 'High Atlas · snow', 'noon'],
    ['majorelle', 'Jardin Majorelle', 'noon'],
    ['essaouira-beach', 'Essaouira beach', 'noon'],
    ['hassan2', 'Hassan II Mosque · Casablanca', 'evening'],
    ['erg-sunset', 'Erg Chebbi · sunset', 'evening'],
    ['chaouen-dusk', 'Chefchaouen · dusk', 'evening'],
    ['chaouen-sunset', 'Chefchaouen · sunset', 'evening'],
    ['jemaa-sunset', 'Jemaa el-Fnaa · sunset', 'evening'],
    ['koutoubia-sunset', 'Koutoubia · sunset', 'evening'],
    ['essaouira-sunset', 'Essaouira · sunset', 'evening'],
    ['massa-sunset', 'Sidi Rabat · ocean sunset', 'evening'],
    ['middle-atlas', 'Middle Atlas · golden hour', 'evening'],
    ['kasbah-sunset', 'Kasbah · sunset', 'evening'],
    ['jemaa-night', 'Jemaa el-Fnaa · night', 'night'],
    ['koutoubia-night', 'Koutoubia · night', 'night'],
    ['palmeraie-night', 'Marrakech palm grove · blue hour', 'night'],
    ['fes-gate-night', 'Bab Boujloud · Fes', 'night'],
    ['marrakech-night', 'Marrakech · night', 'night'],
  ];
  // generate these with the prompts in wallpapers/ai/PROMPTS.md and save them as wallpapers/ai/<id>.jpg
  const AI = [
    ['chaouen-dusk', 'Chefchaouen at dusk', 'evening'], ['riad', 'Riad courtyard', 'noon'], ['sahara-night', 'Sahara night camp', 'night'],
    ['atlas-dawn', 'Atlas village at dawn', 'morning'], ['essaouira-storm', 'Essaouira, Atlantic light', 'evening'], ['fes-tannery', 'Fes from the rooftops', 'evening'],
    ['koutoubia-moon', 'Koutoubia under the moon', 'night'], ['oasis', 'Draa valley oasis', 'evening'], ['zellige', 'Zellige & arches', 'noon'], ['caravan-gold', 'Golden caravan', 'evening'],
  ];
  for (const [id, name, tod] of PHOTOS) SCENES['p-' + id] = { name, tod, kind: 'photo', src: WALL + 'photos/' + id + '.jpg', horizon: 700 };
  for (const [id, name, tod] of AI) SCENES['a-' + id] = { name, tod, kind: 'ai', src: WALL + 'ai/' + id + '.jpg', horizon: 700 };

  /* ---------- sprites ---------- */
  function sprite(r, stops) {
    const s = document.createElement('canvas'); s.width = s.height = r * 2;
    const g = s.getContext('2d'), gr = g.createRadialGradient(r, r, 0, r, r, r);
    stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return s;
  }
  const makeGlow = () => sprite(256, [[0, 'rgba(255,255,255,1)'], [.08, 'rgba(255,255,255,.55)'], [.3, 'rgba(255,255,255,.16)'], [1, 'rgba(255,255,255,0)']]);
  let glow = makeGlow();

  const clouds = [];
  function makeClouds() {
    const r = rng(77);
    for (let i = 0; i < 7; i++) {
      const w = Math.round(380 + r() * 420), h = Math.round(w * .32);
      clouds.push({ seed: 1000 + i * 31, w, h, tinted: document.createElement('canvas'), x: r() * W * 1.4 - 200, y: 70 + r() * 340, v: 4 + r() * 9, a: .5 + r() * .5 });
    }
  }
  function puffs(g, c) {
    const r = rng(c.seed), w = c.w, h = c.h;
    for (let k = 0; k < 26; k++) {
      const px = w * (.12 + r() * .76), py = h * (.45 + r() * .3) - Math.sin((px / w) * Math.PI) * h * .22, pr = h * (.18 + r() * .22);
      const gr = g.createRadialGradient(px, py, 0, px, py, pr); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
  }
  let cloudKey = '';
  function tintClouds(p, night, warm) {
    const top = mix(mix([255, 255, 255], p.g, warm * .8), p.u, night * .85);
    const bot = mix(mix(p.u, [255, 255, 255], .35), p.g, warm * .9);
    const key = css(top) + css(mix(bot, p.n, night * .6));
    if (key === cloudKey) return;
    cloudKey = key;
    for (const c of clouds) {
      const t = c.tinted;
      if (t.width !== c.w || t.height !== c.h) { t.width = c.w; t.height = c.h; }
      const g = t.getContext('2d'); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, t.width, t.height);
      puffs(g, c); g.globalCompositeOperation = 'source-atop';
      const gr = g.createLinearGradient(0, 0, 0, t.height); gr.addColorStop(0, css(top)); gr.addColorStop(1, css(mix(bot, p.n, night * .6)));
      g.fillStyle = gr; g.fillRect(0, 0, t.width, t.height);
    }
  }

  // faint Milky Way band, painted once
  const makeMilky = () => {
    const m = document.createElement('canvas'); m.width = W; m.height = 760; const g = m.getContext('2d'), r = rng(11);
    g.translate(W / 2, 380); g.rotate(-.42);
    for (let i = 0; i < 90; i++) { const x = (r() - .5) * 2600, y = (r() - .5) * 120 * (1 + r()), rad = 60 + r() * 140;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${170 + r() * 60},${170 + r() * 50},255,.05)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    for (let i = 0; i < 1600; i++) { const x = (r() - .5) * 2600, y = (r() + r() + r() - 1.5) * 110; g.fillStyle = `rgba(255,255,255,${r() * .5})`; g.fillRect(x, y, r() < .9 ? 1 : 1.6, 1); }
    return m;
  };
  let milky = null; // created at dusk, released at dawn

  const stars = (() => { const r = rng(3); return Array.from({ length: 280 }, () => ({ x: r() * W, y: r() * 680, s: .5 + r() ** 3 * 1.8, p: r() * 6.28, f: .5 + r() * 2 })); })();

  /* ---------- state ---------- */
  let st = null, lights = [], birds = null, shooting = null, phase = '', photo = null;

  function now() { return lapse ? new Date(lapse.virt + (performance.now() - lapse.real) * (lapse.rate ?? 1440)) : new Date(); }

  function update(force) {
    const loc = (TV.state && TV.state.location) || { lat: 33.57, lng: -7.59 };
    const date = now();
    const sm = sunMoon(date, loc.lat, loc.lng);
    const evening = sm.sun.az > 180 ? 1 : 0;
    const eBlend = st ? st.evening + (evening - st.evening) * .2 : evening;
    const p = palette(sm.sun.alt, eBlend);
    const night = clamp((-sm.sun.alt - 2) / 12, 0, 1);
    const warm = clamp(1 - Math.abs(sm.sun.alt - 1) / 9, 0, 1);
    st = { ...sm, p, night, warm, evening: eBlend, date };
    const sc = SCENES[scene];
    if (sc && sc.src && sc.tod && sc.tod !== tod() && cv && !asleep && TV.sky && TV.sky.list(sc.kind).some(k => SCENES[k].tod === tod())) setTimeout(nextPhoto, 0);
    const ph = phaseOf(sm.sun.alt, evening);
    if (ph !== phase) { phase = ph; document.dispatchEvent(new CustomEvent('tv:phase', { detail: ph })); tryPhoto(ph); }
    if (p.s <= 0 && milky) { milky.width = milky.height = 0; milky = null; }
    paintSky(); tintClouds(p, night, warm); dirty = true;
    const key = landKey();
    if (force || (!SCENES[scene].src && key !== lastLandKey && performance.now() - lastLand > 30000)) paintLand();
  }

  const hz = () => SCENES[scene].horizon;
  // azimuth → x: view faces the equator (south for north hemisphere), ~200° wide
  function project(alt, az) {
    const lat = ((TV.state && TV.state.location) || {}).lat || 30;
    const center = lat >= 0 ? 180 : 0;
    let d = ((az - center + 540) % 360) - 180;
    return [W / 2 + d / 100 * W * .5, hz() - alt / 62 * (hz() - 60)];
  }

  function paintSky() {
    const c = skyCache.getContext('2d'), { p, sun } = st, h = hz();
    c.setTransform(SKY, 0, 0, SKY, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, h + 40);
    g.addColorStop(0, css(p.z)); g.addColorStop(.55, css(p.u)); g.addColorStop(1, css(p.h));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const [sx] = project(sun.alt, sun.az), low = clamp(1 - sun.alt / 25, 0, 1) * clamp((sun.alt + 14) / 10, 0, 1);
    if (low > 0) {
      const sy = clamp(project(sun.alt, sun.az)[1], h - 400, h + 60);
      const rg = c.createRadialGradient(sx, sy, 0, sx, sy, 1100);
      rg.addColorStop(0, css(p.g, .75 * low)); rg.addColorStop(.35, css(p.g, .28 * low)); rg.addColorStop(1, css(p.g, 0));
      c.fillStyle = rg; c.fillRect(0, 0, W, H);
      const band = c.createLinearGradient(0, h - 260, 0, h + 20);
      band.addColorStop(0, css(p.g, 0)); band.addColorStop(1, css(p.g, .35 * low));
      c.fillStyle = band; c.fillRect(0, h - 260, W, 300);
    }
    // water: mirrored sky
    const sc = SCENES[scene];
    if (sc.water) {
      const wg = c.createLinearGradient(0, sc.water, 0, H);
      wg.addColorStop(0, css(mix(p.h, p.u, .45))); wg.addColorStop(1, css(mix(p.z, p.n, .35)));
      c.fillStyle = wg; c.fillRect(0, sc.water, W, H - sc.water);
    }
  }

  // the landscape's colors, rounded: it is only repainted when this changes (a full-screen repaint is the costliest thing here)
  let lastLandKey = '';
  const q = c => c.map(v => v >> 3).join(',');
  const landKey = () => [q(st.p.n), q(st.p.g), q(st.p.h), Math.round(st.night * 20)].join('|');
  function paintLand() {
    lastLand = performance.now(); lastLandKey = landKey();
    if (SCENES[scene].src) return paintPhoto(SCENES[scene]);
    landDirty = true;
    const c = landCache.getContext('2d'); c.clearRect(0, 0, W, H); lights = [];
    SCENES[scene].paint(c, st.p, st.night, lights);
    if (SCENES[scene].fore) SCENES[scene].fore(c, st.p);
    // window lights are baked into the still layer
    if (st.night > 0) for (const [x, y, w, h, k] of lights) { c.fillStyle = `rgba(255,196,120,${st.night * k})`; c.fillRect(x, y, w, h); }
    paintScrim(c);
  }

  // the legibility shade behind the text, baked into this layer (same as the page's .scrim)
  function paintScrim(c) {
    const ink = a => `rgba(4,6,14,${a})`;
    let g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, ink(.46)); g.addColorStop(.24, ink(0));
    c.fillStyle = g; c.fillRect(0, 0, W, H * .24);
    g = c.createLinearGradient(0, H, 0, 0); g.addColorStop(0, ink(.86)); g.addColorStop(.26, ink(.55)); g.addColorStop(.52, ink(0));
    c.fillStyle = g; c.fillRect(0, H * .48, W, H * .52);
    const rx = W * .55, ry = H * .48;
    c.save(); c.translate(W * .16, H * .32); c.scale(1, ry / rx);
    g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, ink(.34)); g.addColorStop(.72, ink(0));
    c.fillStyle = g; c.fillRect(-rx, -rx, rx * 2, rx * 2); c.restore();
  }

  function drawWater(t) {
    const sc = SCENES[scene]; if (!sc.water) return;
    const { sun, moon, p, night } = st;
    const body = sun.alt > -3 ? { o: sun, c: p.g, a: clamp((sun.alt + 3) / 6, 0, 1) * (1 - clamp((sun.alt - 30) / 30, 0, .7)) } : { o: moon, c: [235, 230, 210], a: moon.alt > 0 ? .6 * night : 0 };
    if (body.a <= 0) return;
    const [x] = project(body.o.alt, body.o.az);
    ctx.fillStyle = css(body.c);
    for (let y = sc.water + 6; y < H; y += 7) {
      const k = (y - sc.water) / (H - sc.water), w = 30 + k * 160 + Math.sin(t * 1.3 + y * .21) * 18;
      ctx.globalAlpha = clamp(body.a * (1 - k) * (.35 + .25 * Math.sin(t * 2 + y)), 0, 1);
      ctx.fillRect(x - w / 2 + Math.sin(t + y * .05) * 8, y, w, 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawMoon(t) {
    const { moon, phase: ph, waxing, night } = st;
    if (moon.alt < -3 || night < .15) return;
    const [x, y] = project(moon.alt, moon.az), r = 30, a = clamp(night * 1.3, 0, 1);
    ctx.globalAlpha = .4 * a; ctx.drawImage(glow, x - 220, y - 220, 440, 440); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(x, y); if (!waxing) ctx.scale(-1, 1);
    ctx.fillStyle = `rgba(30,36,60,${.55 * a})`; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(246,240,222,${a})`;
    ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
    const k = Math.cos(ph * Math.PI); // 1 new → -1 full
    ctx.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
    ctx.fill(); ctx.restore();
  }

  function drawSun() {
    const { sun, p } = st;
    if (sun.alt < -2) return;
    const [x, y] = project(sun.alt, sun.az), low = clamp(1 - sun.alt / 20, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .55 + .3 * (1 - low); ctx.drawImage(glow, x - 420, y - 420, 840, 840);
    ctx.globalAlpha = .9; ctx.drawImage(glow, x - 150, y - 150, 300, 300);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = css(mix([255, 253, 246], p.g, low * .75)); ctx.beginPath(); ctx.arc(x, y, 30, 0, 7); ctx.fill();
  }

  function drawBirds(t, dt) {
    const { sun } = st;
    if (!birds && sun.alt > 3 && sun.alt < 40 && Math.random() < dt / 40) {
      const dir = Math.random() < .5 ? 1 : -1;
      birds = { x: dir > 0 ? -120 : W + 120, y: 260 + Math.random() * 220, dir, list: Array.from({ length: 5 + (Math.random() * 5 | 0) }, (_, i) => [Math.ceil(i / 2), i % 2 ? 1 : -1, Math.random() * 6]) };
    }
    if (!birds) return;
    birds.x += birds.dir * 60 * dt; birds.y -= 4 * dt;
    ctx.strokeStyle = css(st.p.n, .7); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (const [rank, side, ph] of birds.list) {
      const bx = birds.x - birds.dir * rank * 30, by = birds.y + side * rank * 16, f = Math.sin(t * 9 + ph) * 5;
      ctx.beginPath(); ctx.moveTo(bx - 9, by - f); ctx.quadraticCurveTo(bx - 4, by - 4, bx, by); ctx.quadraticCurveTo(bx + 4, by - 4, bx + 9, by - f); ctx.stroke();
    }
    if (birds.x < -400 || birds.x > W + 400) birds = null;
  }

  function drawShooting(t, dt) {
    if (st.night < .8) return;
    if (!shooting && Math.random() < dt / 22) shooting = { x: 300 + Math.random() * 1300, y: 60 + Math.random() * 220, life: 0 };
    if (!shooting) return;
    shooting.life += dt / .9; const k = shooting.life;
    const x = shooting.x + k * 420, y = shooting.y + k * 160;
    const g = ctx.createLinearGradient(x - 160, y - 60, x, y); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,255,255,${.8 * Math.sin(Math.min(k, 1) * Math.PI)})`);
    ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 160, y - 60); ctx.lineTo(x, y); ctx.stroke();
    if (k >= 1) shooting = null;
  }

  let last = 0;
  function frame(ms) {
    requestAnimationFrame(frame);
    if (ms - last < FRAME) return;       // the sky moves slowly: 24 fps on the TV leaves the GPU free for the UI
    const dt = Math.min(.1, (ms - last) / 1000); last = ms;
    if (asleep || (photo && photo.active)) return;
    if (ms < busyUntil) return; // navigating: let the UI have every frame
    if (ms - lastSky > (lapse ? 120 : mode === 'still' ? 30000 : 2000)) { lastSky = ms; update(lapse && ms - lastLand > 400); }
    if (SCENES[scene].src) { if (landDirty) { landDirty = false; ctx.drawImage(landCache, 0, 0); } return; }
    if (mode === 'still' && !lapse) { if (!dirty) return; dirty = false; }
    const t = (ms - t0) / 1000;
    ctx.drawImage(skyCache, 0, 0, W, H);
    if (st.p.s > 0) {
      if (!milky) milky = makeMilky();
      ctx.globalAlpha = st.p.s * .9; ctx.drawImage(milky, 0, 0); ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      const top = hz() - 20;
      for (const s of stars) {
        if (s.y > top) continue;
        ctx.globalAlpha = st.p.s * (.55 + .45 * Math.sin(t * s.f + s.p)) * (s.s > 1.5 ? 1 : .8);
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
      ctx.globalAlpha = 1;
    }
    drawShooting(t, dt);
    drawMoon(t); drawSun();
    for (const c of clouds) {
      c.x += c.v * dt * (lapse ? 30 : 1); if (c.x > W + 50) c.x = -c.w - 50;
      ctx.globalAlpha = c.a * (1 - st.night * .72); ctx.drawImage(c.tinted, c.x, c.y); ctx.globalAlpha = 1;
    }
    drawBirds(t, dt);
    drawWater(t);
    ctx.drawImage(landCache, 0, 0);
  }

  /* ---------- photo mode: your own images per phase ---------- */
  function tryPhoto(ph) {
    if (!photo) return;
    if (mode !== 'photos') { if (photo.active) { photo.active = false; showCanvas(1); photo.host.innerHTML = ''; } return; }
    const img = new Image();
    img.onload = () => {
      const el = document.createElement('div'); el.className = 'sky-photo'; el.style.backgroundImage = `url("${img.src}")`;
      photo.host.appendChild(el); requestAnimationFrame(() => el.classList.add('in'));
      [...photo.host.children].slice(0, -1).forEach(o => { o.classList.remove('in'); setTimeout(() => o.remove(), 2000); });
      photo.active = true; showCanvas(0);
    };
    img.onerror = () => { if (photo.active) { photo.active = false; showCanvas(1); photo.host.innerHTML = ''; } };
    img.src = `${photo.base}${ph}.jpg`;
  }

  /* ---------- recovery: the TV can drop canvas memory (low GPU memory, coming back from another app).
     A lost canvas is blank/black and nothing repaints the cached layers, so rebuild them all. ---------- */
  function rebuild(why) {
    if (!cv) return;
    console.log('HZSKY rebuild ' + (why || ''));
    glow = makeGlow(); milky = null;
    clouds.length = 0; makeClouds(); cloudKey = '';
    lastLandKey = ''; lastSky = performance.now();
    update(true); dirty = true; last = 0;
  }
  let asleep = false;
  function sleep() {
    if (!cv || asleep) return;
    asleep = true;
    // keep only the visible canvas (it still shows the last frame); free the caches (~20 MB)
    for (const c of [skyCache, landCache, ...clouds.map(c => c.tinted)]) { c.width = 0; c.height = 0; }
    if (milky) { milky.width = milky.height = 0; milky = null; }
    cloudKey = ''; lastLandKey = ''; photoReq++;
  }
  function wake() {
    if (!cv || !asleep) return;
    skyCache.width = W * SKY; skyCache.height = H * SKY; landCache.width = W; landCache.height = H;
    asleep = false; lastSky = performance.now();
    update(true); dirty = true;
  }
  let rebuildTimer = 0;
  const soon = why => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(() => rebuild(why), 120); };
  // isContextLost() is free; the one-pixel read (a lost canvas reads back transparent) only runs when coming back on screen,
  // never periodically, so the browser keeps the canvases on the GPU
  const isLost = () => [cv, skyCache, landCache].some(c => { const g = c.getContext('2d'); return g.isContextLost && g.isContextLost(); });
  function blank() {
    try { return skyCache.getContext('2d').getImageData(4, 4, 1, 1).data[3] === 0; } catch (e) { return false; }
  }

  /* ---------- photos follow the time of day ----------
     Morning, midday, evening and night each have their own photos. When the time of day changes, the wallpaper moves
     to a photo taken at that time; within it, a new photo every hour (Settings → Wallpaper → Photo changes), shuffled
     without repeats, with one short fade. */
  const tod = () => !st ? 'noon' : st.sun.alt < -6 ? 'night' : st.sun.alt >= 12 ? 'noon' : st.sun.az < 180 ? 'morning' : 'evening';
  let order = [], switching = false;
  function nextPhoto() {
    if (switching) return;
    const kind = SCENES[scene].kind, every = TV.sky.list(kind), now = tod();
    const timed = every.filter(k => SCENES[k].tod === now), all = timed.length ? timed : every;   // none for this time yet: any
    if (!all.length || (all.length === 1 && all[0] === scene)) return;
    order = order.filter(k => all.includes(k) && k !== scene);
    if (!order.length) { order = all.filter(k => k !== scene); for (let i = order.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [order[i], order[j]] = [order[j], order[i]]; } }
    const next = order.shift();
    switching = true;
    cv.style.transition = 'opacity .9s ease'; cv.style.opacity = 0;       // one short fade, then everything is still again
    setTimeout(() => {
      TV.sky.setScene(next); switching = false;
      if (TV.settings) { TV.settings.scenes = { ...(TV.settings.scenes || {}), [location.pathname]: next }; TV.saveSettings && TV.saveSettings(); }
      setTimeout(() => { cv.style.opacity = 1; }, 450);
    }, 950);
    TV.store && TV.store.set('photoAt', Date.now());
  }
  setInterval(() => {
    const every = (TV.settings && TV.settings.photoEvery) ?? 60;          // minutes; 0 = never
    if (!cv || asleep || document.hidden || !every || !SCENES[scene].src) return;
    const at = (TV.store && TV.store.get('photoAt', 0)) || 0;
    if (!at) { TV.store && TV.store.set('photoAt', Date.now()); return; }
    if (Date.now() - at >= every * 60e3) nextPhoto();
  }, 60e3);

  /* ---------- time-lapse preview ---------- */
  let label;
  function toggleLapse() {
    lapse = lapse ? null : { real: performance.now(), virt: Date.now() };
    if (!label) { label = document.createElement('div'); label.className = 'sky-label'; document.getElementById('stage').appendChild(label); }
    label.classList.toggle('show', !!lapse);
    lastSky = 0;
  }
  setInterval(() => {
    if (!lapse || !label) return;
    const d = now(); label.innerHTML = `<b>Time-lapse</b> ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${PHASE_NAMES[phase]}<span>T to stop</span>`;
  }, 100);

  const PHASE_NAMES = { night: 'Night', dawn: 'Dawn', sunrise: 'Sunrise', morning: 'Morning', noon: 'Midday', afternoon: 'Afternoon', golden: 'Golden hour', sunset: 'Sunset', dusk: 'Dusk' };

  TV.sky = {
    SCENES, PHASE_NAMES,
    start(canvas, opts = {}) {
      // ONE opaque on-screen layer: the soft sky gradient is cached at half resolution, the crisp landscape is
      // cached at full resolution and repainted rarely; each sky frame stamps both. While the UI animates, the
      // TV only has to copy this single opaque layer instead of blending a sky and a landscape every frame.
      cv = canvas; cv.width = W; cv.height = H; ctx = cv.getContext('2d', { alpha: false });
      skyCache = document.createElement('canvas'); skyCache.width = W * SKY; skyCache.height = H * SKY;
      landCache = document.createElement('canvas'); landCache.width = W; landCache.height = H;
      for (const c of [cv, skyCache, landCache]) c.addEventListener('contextrestored', () => soon('restored'));
      // back on screen after standby / another app: check the layers survived
      document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => { if (asleep) wake(); else if (isLost() || blank()) rebuild('back'); else dirty = true; }, 300); });
      setInterval(() => { if (!document.hidden && !asleep && isLost()) soon('lost'); }, 10000);
      scene = ((TV.settings && TV.settings.scenes) || {})[location.pathname] || opts.scene || 'dunes';
      if (opts.photoHost) photo = { host: opts.photoHost, base: opts.photoBase || '../wallpapers/', active: false };
      mode = (TV.settings && TV.settings.wallMode) || 'live';
      document.body.classList.add('scrim-baked');
      if (!SCENES[scene]) scene = 'dunes';
      makeClouds(); update(true); requestAnimationFrame(frame);
      // which AI paintings exist, and the photo credits (small files, read once)
      setTimeout(() => {
        fetch(WALL + 'photos/credits.json').then(r => r.json()).then(list => { for (const x of list) credits['p-' + x.id] = x; }).catch(() => { });
        for (const [id] of AI) fetch(WALL + 'ai/' + id + '.jpg', { method: 'HEAD' }).then(r => { if (r.ok) aiReady.add('a-' + id); }).catch(() => { });
      }, 3000);
    },
    setScene(s) { if (!SCENES[s]) return; scene = s; lastLand = 0; landDirty = true; update(true); TV.store && TV.store.set('photoAt', Date.now()); }, // the hour starts again from a new photo
    // scenes you can pick in a category: painted, photo, ai (only the AI paintings you have added)
    list(kind) { return Object.keys(SCENES).filter(k => SCENES[k].kind === kind && (kind !== 'ai' || aiReady.has(k))); },
    credit(k = scene) { return credits[k] || null; },
    nextPhoto, get timeOfDay() { return tod(); },
    rebuild, sleep,
    wake() { setTimeout(wake, 150); }, // after the first frame is back on screen
    setMode(m) { mode = m; dirty = true; tryPhoto(phase); },
    get scene() { return scene; },
    get mode() { return mode; },
    get phase() { return phase; },
    get state() { return st; },
    toggleLapse, refresh() { update(true); },
    // freeze the sky at a given hour (debug / previews): TV.sky.at(18.2)
    at(h) { const d = new Date(); d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0); lapse = { real: performance.now(), virt: d.getTime(), rate: 0 }; lastLand = 0; update(true); },
  };

  document.addEventListener('keydown', e => { if ((e.key === 't' || e.key === 'T') && TV.sky && cv) toggleLapse(); });
})();
