/* Live art: gentle motion painted over a still artwork on one small canvas at ~15 fps.
   The artwork itself stays a plain <img> (one GPU texture, never redrawn); the canvas only carries what moves.
   Effects (spec.fx, several may be combined in an array):
     shimmer  water: horizontal strips of the painting nudged by a slow sine. {x0,x1,y0,y1, amp, speed}
     rain     slanted streaks.        {count, angle, speed, alpha}
     snow     soft flakes drifting.   {count, size, speed}
     petals   blossom petals / leaves turning as they fall. {count, colors, size}
     motes    dust in a sunbeam.      {poly:[[u,v]…], count}
     twinkle  stars that breathe.     {stars:[[u,v,r]…]}
     glow     a light source breathing. {at:[u,v], r, color, amount}
     sweep    a slow sheen travelling across glazed tiles. {period}
   Coordinates are fractions of the artwork (u across, v down). */
window.Live = (function () {
  const FPS = 15;
  let run = null; // { canvas, ctx, layers:[], timer, t0 }

  const rnd = (a, b) => a + Math.random() * (b - a);

  function sprite(r, color, soft) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(r * 2) + 2;
    const g = c.getContext('2d');
    const m = c.width / 2;
    const grd = g.createRadialGradient(m, m, 0, m, m, r);
    grd.addColorStop(0, color);
    grd.addColorStop(soft ? .35 : .7, color.replace(/[\d.]+\)$/, (soft ? .45 : .9) + ')'));
    grd.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function petalSprite(color, w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * 2) + 2; c.height = Math.ceil(h * 2) + 2;
    const g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, -h);
    g.bezierCurveTo(w, -h * .6, w, h * .5, 0, h);
    g.bezierCurveTo(-w, h * .5, -w, -h * .6, 0, -h);
    g.fill();
    g.globalAlpha = .25; g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(-w * .25, -h * .2, w * .3, h * .5, 0, 0, Math.PI * 2); g.fill();
    return c;
  }

  /* --- effect factories: each returns draw(ctx, t, dt) working in canvas pixels --- */

  const FX = {
    shimmer(o, view) {
      const { img, map, W, H } = view;
      const nw = img.naturalWidth, nh = img.naturalHeight;
      const x0 = o.x0 || 0, x1 = o.x1 == null ? 1 : o.x1, y0 = o.y0, y1 = o.y1 == null ? 1 : o.y1;
      const amp = (o.amp || 1.4) * view.dpr, speed = o.speed || 1;
      const step = Math.max(2, Math.round(2 * view.dpr));
      // the strip of the canvas that holds water (clipped to the visible art box)
      const top = Math.max(0, Math.floor(map.y + y0 * map.h)), bottom = Math.min(H, Math.ceil(map.y + y1 * map.h));
      const left = Math.max(0, Math.floor(map.x + x0 * map.w)), right = Math.min(W, Math.ceil(map.x + x1 * map.w));
      const sx = nw / map.w, sy = nh / map.h;
      const feather = (bottom - top) * .12;
      return (ctx, t) => {
        for (let y = top; y < bottom; y += step) {
          const d = (y - top) / (bottom - top);               // 0 at the horizon, 1 at the front
          const k = .35 + d * .9;                              // waves grow towards the viewer
          const off = Math.sin(t * speed * 1.3 + y * (.045 / view.dpr) / (.4 + d)) * amp * k
                    + Math.sin(t * speed * .7 + y * .013 / view.dpr) * amp * .5 * k;
          ctx.globalAlpha = y - top < feather ? (y - top) / feather : 1;
          const srcX = (left - map.x) * sx, srcY = (y - map.y) * sy;
          ctx.drawImage(img, srcX, srcY, (right - left) * sx, step * sy, left + off, y, right - left, step);
        }
        ctx.globalAlpha = 1;
      };
    },

    rain(o, view) {
      const { W, H, dpr } = view;
      const n = o.count || 160, ang = o.angle == null ? .15 : o.angle, sp = (o.speed || 1) * H * 1.4;
      const drops = Array.from({ length: n }, () => ({ x: rnd(-W * .2, W * 1.1), y: rnd(0, H), l: rnd(.6, 1.2) }));
      return (ctx, t, dt) => {
        ctx.strokeStyle = `rgba(230,236,245,${o.alpha || .35})`;
        ctx.lineWidth = dpr * .9;
        ctx.beginPath();
        for (const d of drops) {
          d.y += sp * dt * d.l; d.x += sp * dt * d.l * ang;
          if (d.y > H) { d.y = rnd(-40, 0); d.x = rnd(-W * .2, W * 1.05); }
          const len = 26 * dpr * d.l;
          ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - len * ang, d.y - len);
        }
        ctx.stroke();
      };
    },

    snow(o, view) {
      const { W, H, dpr } = view;
      const n = o.count || 120, size = (o.size || 1) * dpr;
      const sprites = [sprite(1.4 * size, 'rgba(255,255,255,.95)'), sprite(2.2 * size, 'rgba(255,255,255,.85)', 1), sprite(3.4 * size, 'rgba(255,255,255,.6)', 1)];
      const flakes = Array.from({ length: n }, () => ({ x: rnd(0, W), y: rnd(0, H), z: Math.random() < .55 ? 0 : Math.random() < .7 ? 1 : 2, p: rnd(0, 6.28) }));
      const sp = (o.speed || 1) * H * .06;
      return (ctx, t, dt) => {
        for (const f of flakes) {
          f.y += sp * dt * (1 + f.z * .6);
          const x = f.x + Math.sin(t * .6 + f.p) * 10 * dpr * (1 + f.z);
          if (f.y > H + 8) { f.y = -8; f.x = rnd(0, W); }
          ctx.drawImage(sprites[f.z], x, f.y);
        }
      };
    },

    petals(o, view) {
      const { W, H, dpr } = view;
      const n = o.count || 26, s = (o.size || 1) * dpr;
      const colors = o.colors || ['#f7d9de', '#fbeef0', '#efc3cc'];
      const sprites = colors.map(c => petalSprite(c, 3.2 * s, 5 * s));
      const ps = Array.from({ length: n }, () => ({ x: rnd(0, W), y: rnd(-H, H), r: rnd(0, 6.28), vr: rnd(-1, 1), sw: rnd(.4, 1), p: rnd(0, 6.28), k: (Math.random() * sprites.length) | 0, z: rnd(.6, 1.2) }));
      const sp = (o.speed || 1) * H * .05, wind = (o.wind == null ? .4 : o.wind) * sp;
      return (ctx, t, dt) => {
        for (const p of ps) {
          p.y += sp * dt * p.z; p.x += wind * dt * p.z; p.r += p.vr * dt;
          if (p.y > H + 20 || p.x > W + 20) { p.y = rnd(-40, -10); p.x = rnd(-W * .2, W); }
          const x = p.x + Math.sin(t * .8 * p.sw + p.p) * 18 * dpr;
          const flip = Math.cos(t * 1.6 * p.sw + p.p); // the petal turning over
          ctx.setTransform(flip * p.z, 0, 0, p.z, x, p.y);
          ctx.rotate(p.r);
          const sp2 = sprites[p.k];
          ctx.drawImage(sp2, -sp2.width / 2, -sp2.height / 2);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      };
    },

    motes(o, view) {
      const { map, dpr } = view;
      const poly = o.poly.map(([u, v]) => [map.x + u * map.w, map.y + v * map.h]);
      const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      const bx = Math.min(...xs), by = Math.min(...ys), bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
      const inside = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
      const spr = [sprite(1.3 * dpr, 'rgba(255,246,222,.9)'), sprite(2.2 * dpr, 'rgba(255,240,210,.55)', 1)];
      const ms = Array.from({ length: o.count || 60 }, () => ({ x: bx + Math.random() * bw, y: by + Math.random() * bh, vx: rnd(-1, 1), vy: rnd(-1, 1), p: rnd(0, 6.28), k: Math.random() < .7 ? 0 : 1 }));
      return (ctx, t, dt) => {
        for (const m of ms) {
          m.vx += rnd(-.6, .6) * dt; m.vy += rnd(-.6, .6) * dt - .05 * dt;
          m.vx *= .98; m.vy *= .98;
          m.x += m.vx * 6 * dpr * dt; m.y += m.vy * 6 * dpr * dt;
          if (m.x < bx || m.x > bx + bw || m.y < by || m.y > by + bh) { m.x = bx + Math.random() * bw; m.y = by + Math.random() * bh; }
          if (!inside(m.x, m.y)) continue;
          ctx.globalAlpha = .45 + .55 * Math.max(0, Math.sin(t * .9 + m.p));
          ctx.drawImage(spr[m.k], m.x, m.y);
        }
        ctx.globalAlpha = 1;
      };
    },

    twinkle(o, view) {
      const { map, dpr } = view;
      const color = o.color || 'rgba(255,248,220,.9)';
      const stars = o.stars.map(([u, v, r]) => ({ x: map.x + u * map.w, y: map.y + v * map.h, s: sprite(Math.max(3, (r || .012) * map.w), color, 1), p: rnd(0, 6.28), f: rnd(.5, 1.3) }));
      return ctx => {
        const t = performance.now() / 1000;
        ctx.globalCompositeOperation = 'lighter';
        for (const s of stars) {
          ctx.globalAlpha = (o.amount || .55) * (.5 + .5 * Math.sin(t * s.f + s.p));
          ctx.drawImage(s.s, s.x - s.s.width / 2, s.y - s.s.height / 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      };
    },

    glow(o, view) {
      const { map } = view;
      const r = (o.r || .15) * map.w;
      const s = sprite(r, o.color || 'rgba(255,214,150,.5)', 1);
      const x = map.x + o.at[0] * map.w - s.width / 2, y = map.y + o.at[1] * map.h - s.height / 2;
      return (ctx, t) => {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (o.amount || .35) * (.55 + .45 * Math.sin(t * (o.speed || .5)));
        ctx.drawImage(s, x, y);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      };
    },

    sweep(o, view) {
      const { W, H } = view;
      const period = o.period || 36;
      return (ctx, t) => {
        const p = (t % period) / period;               // 0..1 across, then rests off-screen
        const cx = -W * .4 + p * W * 2.2;
        const g = ctx.createLinearGradient(cx - W * .25, 0, cx + W * .25, H * .4);
        g.addColorStop(0, 'rgba(255,250,235,0)');
        g.addColorStop(.5, `rgba(255,250,235,${o.amount || .13})`);
        g.addColorStop(1, 'rgba(255,250,235,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      };
    },
  };

  // effects that copy pixels need the canvas at full resolution; the rest are soft and run at half
  const SHARP = { shimmer: 1, twinkle: 1, sweep: 0 };

  /**
   * start(box, img, spec, fit): box is the element showing the art (the canvas fills it),
   * fit = { x, y, w, h } where the whole image is drawn inside the box, in CSS px (cover crops make it larger than the box).
   */
  function start(box, img, spec, fit) {
    stop();
    if (!spec) return;
    const list = Array.isArray(spec) ? spec : [spec];
    const sharp = list.some(s => SHARP[s.fx]);
    const dpr = (window.devicePixelRatio || 1) * (sharp ? 1 : .5);
    const bw = box.clientWidth, bh = box.clientHeight;
    const canvas = document.createElement('canvas');
    canvas.className = 'live';
    canvas.width = Math.round(bw * dpr); canvas.height = Math.round(bh * dpr);
    box.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const view = { img, dpr, W: canvas.width, H: canvas.height, map: { x: fit.x * dpr, y: fit.y * dpr, w: fit.w * dpr, h: fit.h * dpr } };
    const layers = list.map(s => FX[s.fx] && FX[s.fx](s, view)).filter(Boolean);
    run = { canvas, ctx, layers, timer: 0, last: 0, t0: performance.now(), paused: false };
    loop(run);
  }

  function loop(me) {
    const tick = () => {
      if (run !== me || me.paused) return;
      const now = performance.now();
      const dt = Math.min(.2, (now - (me.last || now)) / 1000);
      me.last = now;
      me.ctx.clearRect(0, 0, me.canvas.width, me.canvas.height);
      for (const draw of me.layers) draw(me.ctx, (now - me.t0) / 1000, dt);
      me.timer = setTimeout(tick, 1000 / FPS);
    };
    tick();
  }

  function stop() {
    if (!run) return;
    clearTimeout(run.timer);
    run.canvas.width = run.canvas.height = 0; // hand the backing store back right away
    run.canvas.remove();
    run = null;
  }

  function pause() { if (run) { run.paused = true; clearTimeout(run.timer); } }
  function resume() {
    if (!run || !run.paused) return;
    run.paused = false; run.last = 0;
    loop(run);
  }

  return { start, stop, pause, resume, get running() { return !!run && !run.paused; } };
})();
