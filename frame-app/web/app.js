/* Riwaq: the wall, the gallery and the frame & wall panel. */
(function () {
  const W = 960, H = 540;
  const $ = s => document.querySelector(s);
  const app = $('#app'), stage = $('#stage'), wall = $('#wall');
  const BY_ID = Object.fromEntries(CATALOG.map(p => [p.id, p]));

  /* ---------------- settings ---------------- */
  const OPTIONS = {
    frame: { label: 'Frame', values: [['curated', 'Curated'], ['arch', 'Riwaq arch'], ['gallery', 'Walnut'], ['gilded', 'Gilded'], ['zellige', 'Zellige'], ['float', 'Whole artwork'], ['full', 'Full screen']] },
    wall: { label: 'Wall', values: [['plaster', 'Plaster'], ['linen', 'Linen'], ['teal', 'Riad teal'], ['clay', 'Terracotta'], ['green', 'Zellige green'], ['ink', 'Night ink']] },
    motion: { label: 'Living art', values: [['on', 'Moving'], ['off', 'Still']] },
    every: { label: 'Change art', values: [['0', 'Never'], ['15', 'Every 15 min'], ['60', 'Every hour'], ['1440', 'Every day']] },
    from: { label: 'Choose from', values: [['all', 'Everything'], ['live', 'Living art'], ['row', 'Same collection']] },
    sound: { label: 'Fireplace sound', values: [['on', 'Crackling'], ['off', 'Silent']] },
    caption: { label: 'Caption', values: [['change', 'When art changes'], ['always', 'Always'], ['never', 'Never']] },
  };
  const WALLS = { plaster: '#E6D9C3', linen: '#EEEAE2', teal: '#15383A', clay: '#9E4F37', green: '#2A544E', ink: '#0E1A1B' };
  const MATS = { plaster: '#F2EBDD', linen: '#F7F4EE', teal: '#15383A', clay: '#9E4F37', green: '#2A544E', ink: '#101C1D' };
  const DARK = { teal: 1, clay: 1, green: 1, ink: 1 };
  const DEFAULTS = { piece: 'seasons', frame: 'curated', wall: 'plaster', motion: 'on', every: '0', from: 'all', caption: 'change', sound: 'on', row: 'live', launches: 0 };
  let S;
  try { S = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('riwaq') || '{}')); } catch (e) { S = Object.assign({}, DEFAULTS); }
  const save = () => localStorage.setItem('riwaq', JSON.stringify(S));

  /* ---------------- collections ---------------- */
  const SEASON_NAMES = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
  const season = () => SEASON_NAMES[new Date().getMonth()];
  const resolve = id => id === 'seasons' ? BY_ID[SEASONS[season()]] : BY_ID[id] || CATALOG[0];
  const ROWS = [
    { id: 'live', name: 'Living art', note: 'gentle motion', ids: ['seasons', ...CATALOG.filter(p => p.live).map(p => p.id)] },
    { id: 'fireplace', name: 'Fireplace' },
    { id: 'masters', name: 'Masterpieces' },
    { id: 'islamic', name: 'Islamic art & Morocco' },
    { id: 'japan', name: 'Japan' },
    { id: 'photo', name: 'Photography' },
    { id: 'illustration', name: 'Illustration' },
  ];
  ROWS.forEach(r => { if (!r.ids) r.ids = CATALOG.filter(p => p.cols.includes(r.id)).map(p => p.id); });

  const LIVE_WORDS = { shimmer: 'the water moves', rain: 'rain falls', snow: 'snow falls', petals: 'blossom drifts down', motes: 'dust dances in the light', twinkle: 'the stars glimmer', glow: 'the light breathes', sweep: 'light passes over the gold' };
  const liveText = p => {
    if (p.video) return 'Living art · a real fire, filmed by the National Park Service';
    if (!p.live) return '';
    const words = [...new Set(p.live.map(f => f.leaves ? 'leaves fall' : LIVE_WORDS[f.fx]))];
    return 'Living art · ' + words.join(', ');
  };

  /* ---------------- layout ---------------- */
  function curated(p) {
    if (p.id.startsWith('zellige') || p.video) return 'full';
    if (p.cols.includes('islamic') && !p.cols.includes('photo')) return 'arch';
    if (p.cols.includes('masters')) return 'gilded';
    return 'gallery';
  }

  function fit(ar, maxW, maxH) {
    let w = maxW, h = w / ar;
    if (h > maxH) { h = maxH; w = h * ar; }
    return { w: Math.round(w), h: Math.round(h) };
  }

  // the art box and the frame around it, in CSS px. Like a frame TV, the screen itself is the frame:
  // the moulding runs along the screen edges and the art fills everything inside it (cropped around its focus).
  function layout(p, frame) {
    const ar = p.w / p.h;
    const framed = mould => ({ frame: { x: 0, y: 0, w: W, h: H }, art: { x: mould, y: mould, w: W - 2 * mould, h: H - 2 * mould }, cover: true });
    switch (frame) {
      case 'gallery': return framed(16);
      case 'gilded': return framed(30);
      case 'zellige': return framed(34);
      case 'full': return { art: { x: 0, y: 0, w: W, h: H }, cover: true };
      case 'float': { const a = fit(ar, W - 48, H - 40); return { art: { x: Math.round((W - a.w) / 2), y: Math.round((H - a.h) / 2), w: a.w, h: a.h }, cover: false }; }
      case 'arch': {
        // a wide Moorish horseshoe arch spanning the screen: the art fills it, the plaster wall shows only in the corners
        const rx = 468, ry = 262, cx = W / 2, cy = 14 + ry, a = rx * .93;
        const yj = cy + ry * Math.sqrt(1 - (a / rx) ** 2);
        const l = (cx - a).toFixed(1), r = (cx + a).toFixed(1);
        const open = `M${l} ${H} L${l} ${yj.toFixed(1)} A${rx} ${ry} 0 1 1 ${r} ${yj.toFixed(1)} L${r} ${H}`;
        return { art: { x: 0, y: 0, w: W, h: H }, cover: true, arch: { open, closed: open + ' Z' } };
      }
    }
  }

  const px = (el, r) => Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });

  /* ---------------- the wall ---------------- */
  let current = null, currentEl = null, building = 0;

  function setWall() {
    app.style.setProperty('--wall', WALLS[S.wall]);
    app.style.setProperty('--mat', MATS[S.wall]);
    wall.classList.toggle('dark', !!DARK[S.wall]);
  }

  async function show(id, opts = {}) {
    const ticket = ++building;
    const p = resolve(id);
    const frame = S.frame === 'curated' ? curated(p) : S.frame;
    const L = layout(p, frame);
    let img;
    if (p.video) {
      img = document.createElement('video');
      Object.assign(img, { muted: S.sound !== 'on', loop: true, playsInline: true, preload: 'auto', src: p.video });
      img.poster = p.video.replace('.mp4', '.jpg');
      img.addEventListener('playing', () => console.log('video playing ' + p.id + (img.muted ? ' (muted)' : ' (sound)')));
      img.addEventListener('error', () => console.log('video error ' + p.id + ' ' + (img.error && img.error.code)));
      await new Promise(ok => { img.addEventListener('loadeddata', ok, { once: true }); img.addEventListener('error', ok, { once: true }); setTimeout(ok, 4000); });
    } else {
      img = new Image();
      img.src = 'art/' + p.id + '.jpg';
      try { await img.decode(); } catch (e) { /* still show what we have */ }
    }
    if (ticket !== building) return;

    const el = document.createElement('div');
    el.className = 'piece f-' + frame + (p.cols.includes('photo') ? ' photo' : '');
    if (L.frame) {
      const f = document.createElement('div'); f.className = 'frame'; px(f, L.frame);
      el.appendChild(f);
    }
    const box = document.createElement('div'); box.className = 'art'; px(box, L.art);
    // where the whole image sits inside the box: exact fit when framed, cropped around its focus when it fills
    const bw = L.art.w, bh = L.art.h;
    let iw = bw, ih = bh, ix = 0, iy = 0;
    if (L.cover) {
      const k = Math.max(bw / p.w, bh / p.h);
      iw = p.w * k; ih = p.h * k;
      const [fu, fv] = p.focus || [.5, .5];
      ix = Math.min(0, Math.max(bw - iw, bw / 2 - fu * iw));
      iy = Math.min(0, Math.max(bh - ih, bh / 2 - fv * ih));
    }
    Object.assign(img.style, { left: ix + 'px', top: iy + 'px', width: iw + 'px', height: ih + 'px' });
    box.appendChild(img);
    el.appendChild(box);
    if (L.arch) el.appendChild(archSvg(L));
    stage.appendChild(el);

    Live.stop();
    const old = currentEl;
    current = id; currentEl = el;
    void el.offsetWidth;
    el.classList.add('in');
    if (old) {
      old.classList.remove('in');
      setTimeout(() => { release(old); old.remove(); }, 950);
    }
    const startLive = () => {
      if (ticket !== building || document.hidden || document.body.classList.contains('browsing')) return;
      if (p.video) {
        img.muted = S.sound !== 'on';
        // a PC browser refuses sound before the first click: play silently there instead
        img.play().catch(() => { img.muted = true; img.play().catch(() => {}); });
        return;
      }
      if (S.motion !== 'on' || !p.live) return;
      Live.start(box, img, p.live, { x: ix, y: iy, w: iw, h: ih });
    };
    setTimeout(startLive, old && !opts.fast ? 950 : 50);
    el._live = startLive;
    plaque(p, id);
    schedule();
  }

  let archSeq = 0;
  // hand an old piece's image or video decoder back straight away
  function release(el) {
    el.querySelectorAll('img').forEach(i => i.removeAttribute('src'));
    el.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
  }
  const pauseVideo = () => currentEl && currentEl.querySelectorAll('video').forEach(v => v.pause());

  function archSvg(L) {
    const { w, h } = L.art;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'arch');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    px(svg, L.art);
    const dark = !!DARK[S.wall];
    // the plaster wall around the opening is a static overlay (no clip on the moving art: masks cost GPU time on every frame)
    const wallCol = WALLS[S.wall], u = 'a' + (++archSeq);
    svg.innerHTML =
      `<defs><clipPath id="${u}in"><path d="${L.arch.closed}"/></clipPath>` +
      `<radialGradient id="${u}lamp" cx=".5" cy="0" r=".75"><stop offset="0" stop-color="#fffaf0" stop-opacity="${dark ? .10 : .22}"/><stop offset="1" stop-color="#fffaf0" stop-opacity="0"/></radialGradient></defs>` +
      `<path fill-rule="evenodd" fill="${wallCol}" d="M-2 -2H${w + 2}V${h + 2}H-2Z ${L.arch.closed}"/>` +
      `<path fill-rule="evenodd" fill="url(#${u}lamp)" d="M-2 -2H${w + 2}V${h + 2}H-2Z ${L.arch.closed}"/>` +
      // carved plaster surround, the depth of the reveal inside the opening, and a brass line
      `<path d="${L.arch.open}" fill="none" stroke="${dark ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.35)'}" stroke-width="34"/>` +
      `<g clip-path="url(#${u}in)"><path d="${L.arch.open}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="16"/><path d="${L.arch.open}" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="30"/></g>` +
      `<path d="${L.arch.open}" fill="none" stroke="#C9A15B" stroke-width="3.5"/>`;
    return svg;
  }

  /* caption plaque */
  const plaqueEl = $('#plaque');
  let plaqueTimer;
  function plaque(p, id, force) {
    clearTimeout(plaqueTimer);
    const busy = document.body.classList.contains('styling') || document.body.classList.contains('browsing');
    if ((S.caption === 'never' || busy) && !force) { plaqueEl.classList.remove('show'); return; }
    const seasonal = id === 'seasons' ? ` · The Four Seasons, ${season()}` : '';
    plaqueEl.querySelector('.p-title').textContent = p.title;
    plaqueEl.querySelector('.p-by').innerHTML = `${esc(p.artist)}, ${esc(p.year)}${seasonal}` + ((p.live && S.motion === 'on') || p.video ? '<span class="live">LIVE</span>' : '');
    plaqueEl.classList.add('show');
    if (S.caption !== 'always' || force) plaqueTimer = setTimeout(() => plaqueEl.classList.remove('show'), 7000);
  }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  /* what to play next */
  function playlist() {
    if (S.from === 'live') return ROWS[0].ids;
    if (S.from === 'row' || BY_ID[current] && BY_ID[current].video) return (ROWS.find(r => r.id === (BY_ID[current] && BY_ID[current].video ? 'fireplace' : S.row)) || ROWS[0]).ids;
    return ['seasons', ...CATALOG.filter(p => !p.video).map(p => p.id)];
  }
  function step(dir) {
    const list = playlist();
    let i = list.indexOf(current);
    if (i < 0) i = 0;
    pick(list[(i + dir + list.length) % list.length]);
  }
  function pick(id) { S.piece = id; save(); show(id); }

  let timer;
  function schedule() {
    clearTimeout(timer);
    const min = +S.every;
    if (!min) return;
    timer = setTimeout(() => {
      const list = playlist().filter(id => id !== current);
      pick(list[Math.floor(Math.random() * list.length)]);
    }, min * 60000);
  }

  /* ---------------- wall keys ---------------- */
  const hint = $('#hint');
  let hintTimer;
  function showHint() { hint.classList.add('show'); clearTimeout(hintTimer); hintTimer = setTimeout(() => hint.classList.remove('show'), 5000); }

  R.wallKey = e => {
    switch (e.key) {
      case 'Enter': case ' ': e.preventDefault(); if (!e.repeat) openGallery(); break;
      case 'ArrowUp': case 'ContextMenu': case 'm': e.preventDefault(); openStyle(); break;
      case 'ArrowLeft': e.preventDefault(); step(-1); break;
      case 'ArrowRight': e.preventDefault(); step(1); break;
      case 'ArrowDown': e.preventDefault(); if (plaqueEl.classList.contains('show') && S.caption !== 'always') plaqueEl.classList.remove('show'); else { plaque(resolve(current), current, true); showHint(); } break;
      case 'Escape': case 'Backspace': case 'GoBack': e.preventDefault(); if (window.RiwaqNative) RiwaqNative.exit(); break;
    }
  };

  /* ---------------- gallery ---------------- */
  const gallery = $('#gallery'), rowsIn = $('.g-rows-in');
  let built = false;

  function buildGallery() {
    rowsIn.innerHTML = ROWS.map(r => `
      <div class="g-row" data-row-id="${r.id}">
        <h3>${r.name}<em>${r.ids.length}</em></h3>
        <div class="g-view"><div class="g-track" data-row>
          ${r.ids.map(id => {
            const p = id === 'seasons' ? resolve(id) : BY_ID[id];
            return `<div class="tile" data-focus data-id="${id}" data-r="${r.id}" style="background-image:url(thumbs/${p.id}.jpg)">${(p.live || p.video || id === 'seasons') ? '<span class="tag">LIVE</span>' : ''}</div>`;
          }).join('')}
        </div></div>
      </div>`).join('');
    rowsIn.addEventListener('click', e => {
      const t = e.target.closest('.tile'); if (!t) return;
      S.row = t.dataset.r;
      closeGallery();
      if (t.dataset.id !== current) pick(t.dataset.id);
    });
    built = true;
  }

  function openGallery() {
    if (!built) buildGallery();
    Live.pause(); pauseVideo();
    clearTimeout(galleryOff);
    gallery.style.display = '';
    void gallery.offsetWidth;
    gallery.classList.add('open');
    document.body.classList.add('browsing');
    rowsIn.querySelectorAll('.tile.now').forEach(t => t.classList.remove('now'));
    const all = [...rowsIn.querySelectorAll(`.tile[data-id="${current}"]`)];
    all.forEach(t => t.classList.add('now'));
    const start = all.find(t => t.dataset.r === S.row) || all[0] || rowsIn.querySelector('.tile');
    R.reset();
    R.focus(start);
    plaqueEl.classList.remove('show');
  }

  let galleryOff;
  function closeGallery() {
    gallery.classList.remove('open');
    // once it has faded, take the gallery out of rendering entirely so its tiles' memory goes back to the TV
    clearTimeout(galleryOff);
    galleryOff = setTimeout(() => { gallery.style.display = 'none'; }, 300);
    document.body.classList.remove('browsing');
    R.reset();
    hero.removeAttribute('src');
    if (currentEl && currentEl._live && !Live.running) { Live.stop(); currentEl._live(); }
  }
  gallery.addEventListener('close', closeGallery);

  const hero = $('.g-preview img');
  let heroTimer;
  document.addEventListener('r:focus', e => {
    const t = e.detail;
    if (!t.classList.contains('tile')) return;
    const id = t.dataset.id, p = id === 'seasons' ? resolve(id) : BY_ID[id];
    const row = ROWS.find(r => r.id === t.dataset.r);
    $('.g-eyebrow').textContent = id === 'seasons' ? 'The Four Seasons · ' + season() : row.name;
    $('.g-title').textContent = p.title;
    $('.g-by').textContent = `${p.artist}, ${p.year}`;
    $('.g-where').textContent = p.where;
    $('.g-live').textContent = id === 'seasons' ? 'Changes with the real seasons · ' + liveText(p).replace('Living art · ', '') : liveText(p);
    hero.src = 'thumbs/' + p.id + '.jpg';
    clearTimeout(heroTimer);
    heroTimer = setTimeout(() => { hero.src = 'mid/' + p.id + '.jpg'; }, 300); // sharper once you pause on it
    // keep the focused row at the top of the list
    const rowEl = t.closest('.g-row');
    const idx = [...rowsIn.children].indexOf(rowEl);
    const y = Math.min(idx, ROWS.length - 2) * 140;
    rowsIn.style.transform = `translate3d(0,${-y}px,0)`;
  });

  /* ---------------- frame & wall ---------------- */
  const style = $('#style'), list = $('.s-list');
  function buildStyle() {
    list.innerHTML = Object.entries(OPTIONS).map(([k, o]) => `<div class="s-row" data-focus data-cycle data-k="${k}"><span class="k">${o.label}</span><span class="v"></span></div>`).join('');
    list.querySelectorAll('.s-row').forEach(row => {
      const k = row.dataset.k;
      const paint = () => { row.querySelector('.v').textContent = OPTIONS[k].values.find(v => v[0] === S[k])[1]; };
      paint();
      const change = d => {
        const vals = OPTIONS[k].values.map(v => v[0]);
        S[k] = vals[(vals.indexOf(S[k]) + d + vals.length) % vals.length];
        save(); paint(); apply(k);
      };
      row.addEventListener('cycle', e => change(e.detail));
      row.addEventListener('click', () => change(1));
    });
  }
  function apply(k) {
    if (k === 'wall') { setWall(); if ((S.frame === 'arch' || (S.frame === 'curated' && curated(resolve(current)) === 'arch'))) show(current, { fast: true }); }
    if (k === 'frame') show(current, { fast: true });
    if (k === 'motion') { if (S.motion === 'off') Live.stop(); else if (currentEl) currentEl._live(); }
    if (k === 'every') schedule();
    if (k === 'caption') plaque(resolve(current), current);
    if (k === 'sound' && currentEl) currentEl.querySelectorAll('video').forEach(v => { v.muted = S.sound !== 'on'; });
  }
  function openStyle() {
    if (!list.children.length) buildStyle();
    if (gallery.classList.contains('open')) closeGallery();
    style.classList.add('open');
    document.body.classList.add('styling');
    R.reset();
    R.focus(list.firstElementChild);
    plaqueEl.classList.remove('show');
  }
  function closeStyle() {
    style.classList.remove('open');
    document.body.classList.remove('styling');
    R.reset();
    plaque(resolve(current), current);
  }
  style.addEventListener('close', closeStyle);
  $('#open-style').addEventListener('click', openStyle);

  /* ---------------- life cycle ---------------- */
  // the Android shell calls these when another app covers Riwaq or the screen turns off
  window.RiwaqApp = {
    show(id) { if (BY_ID[id] || id === 'seasons') pick(id); },
    sleep() { Live.pause(); pauseVideo(); clearTimeout(timer); },
    wake() {
      if (!document.body.classList.contains('browsing') && currentEl) {
        if (resolve(current).video) currentEl._live();
        else if (!Live.running && S.motion === 'on') { Live.resume(); if (!Live.running) currentEl._live(); }
      }
      // a new season may have started while we slept
      if (current === 'seasons') show('seasons', { fast: true }); else schedule();
    },
  };
  document.addEventListener('visibilitychange', () => document.hidden ? RiwaqApp.sleep() : RiwaqApp.wake());

  // on a PC the 960x540 stage is scaled to fit the window; on the TV it is exactly the viewport
  function scale() {
    const k = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = Math.abs(k - 1) < .01 ? '' : `translate(${(innerWidth - W * k) / 2}px,${(innerHeight - H * k) / 2}px) scale(${k})`;
  }
  addEventListener('resize', scale);
  scale();

  setWall();
  const asked = new URLSearchParams(location.search).get('piece');
  if (asked && (BY_ID[asked] || asked === 'seasons')) { S.piece = asked; save(); }
  show(S.piece, { fast: true });
  // as the screensaver: just the art, no hints
  if (!/dream=1/.test(location.search)) {
    S.launches++; save();
    if (S.launches <= 3) setTimeout(showHint, 1200);
  }
})();
