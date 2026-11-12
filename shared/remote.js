/* D-pad focus engine.
   [data-focus]        focusable element (Enter = click)
   [data-group]        remembers its last focused child when you come back
   [data-track]        horizontally scrolled strip: slides (transform) to keep focus visible
   [data-cycle]        left/right change its value instead of moving focus (fires 'cycle' event)
   .layer.open         modal layer: focus is trapped inside the topmost one */
window.TV = window.TV || {};

(function () {
  let current = null;
  const memory = new WeakMap();

  const scope = () => {
    const layers = [...document.querySelectorAll('.layer.open')];
    return layers.length ? layers[layers.length - 1] : document.getElementById('stage');
  };
  const items = () => [...scope().querySelectorAll('[data-focus]')]
    .filter(el => el.getClientRects().length && !el.closest('.layer:not(.open)'));

  function focus(el) {
    if (!el || el === current) return;
    if (current) current.classList.remove('is-focused');
    current = el;
    el.classList.add('is-focused');
    const group = el.closest('[data-group]');
    if (group) memory.set(group, el);
    slideTrack(el);
    document.dispatchEvent(new CustomEvent('tv:focus', { detail: el }));
  }

  function slideTrack(el) {
    const track = el.closest('[data-track]');
    if (!track) return;
    const view = track.parentElement;
    const pad = +(track.dataset.track || 0) || 96;
    const viewW = view.clientWidth;
    const left = el.offsetLeft, right = left + el.offsetWidth;
    let x = +(track.dataset.x || 0);
    if (left + x < pad) x = pad - left;
    if (right + x > viewW - pad) x = viewW - pad - right;
    x = Math.min(0, Math.max(x, viewW - track.scrollWidth));
    track.dataset.x = x;
    track.style.transform = `translate3d(${x}px,0,0)`;
  }

  function move(dir) {
    const list = items();
    if (!current || !list.includes(current)) return focus(list[0]);
    // fast path: left/right inside an app row is just the neighbor (no measuring every element)
    if ((dir === 'left' || dir === 'right') && current.parentElement.hasAttribute('data-track')) {
      let n = current;
      do n = dir === 'right' ? n.nextElementSibling : n.previousElementSibling; while (n && !n.hasAttribute('data-focus'));
      return n ? focus(n) : bump(dir);
    }
    const a = current.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === current) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;
      let main, cross;
      if (dir === 'right') { if (b.left < a.right - 4 && dx <= 4) continue; main = dx; cross = dy; }
      if (dir === 'left')  { if (b.right > a.left + 4 && dx >= -4) continue; main = -dx; cross = dy; }
      if (dir === 'down')  { if (b.top < a.bottom - 4 && dy <= 4) continue; main = dy; cross = dx; }
      if (dir === 'up')    { if (b.bottom > a.top + 4 && dy >= -4) continue; main = -dy; cross = dx; }
      if (main <= 0) continue;
      // edge-to-edge: the gap in the direction of travel, plus how far off to the side it is (0 when they line up).
      // Centers alone misjudge tall elements like the matches card.
      const vert = dir === 'up' || dir === 'down';
      const gap = Math.max(0, dir === 'up' ? a.top - b.bottom : dir === 'down' ? b.top - a.bottom : dir === 'left' ? a.left - b.right : b.left - a.right);
      const side = vert ? Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)) : Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
      const score = gap + side * 2.2 + Math.abs(cross) * .1;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (!best) return bump(dir);
    const g = best.closest('[data-group]');
    if (g && g !== current.closest('[data-group]') && memory.has(g) && list.includes(memory.get(g))) best = memory.get(g);
    focus(best);
  }

  // tiny "edge" nudge so the user feels the boundary
  function bump(dir) {
    if (!current) return;
    const k = { left: 'bump-l', right: 'bump-r', up: 'bump-u', down: 'bump-d' }[dir];
    current.classList.remove(k); void current.offsetWidth; current.classList.add(k);
    setTimeout(() => current && current.classList.remove(k), 260);
  }

  const DIRS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  // ambient mode: after a quiet minute the UI steps back and the wallpaper takes the screen
  let idleTimer;
  const wake = () => {
    clearTimeout(idleTimer);
    const was = document.body.classList.contains('idle');
    document.body.classList.remove('idle');
    const min = TV.settings && TV.settings.idle !== undefined ? TV.settings.idle : 1;
    if (min) idleTimer = setTimeout(() => { if (!document.querySelector('.layer.open')) document.body.classList.add('idle'); }, min * 60000);
    return was;
  };
  wake();
  document.addEventListener('mousemove', wake);

  // hold OK on a [data-hold] element (≈0.45 s or the first key repeat) fires 'hold'; a short press still clicks.
  // Elements without data-hold click on key-down for the fastest response.
  let holdTimer = null, held = false;
  const isOk = e => e.key === 'Enter' || e.key === ' ';

  document.addEventListener('keyup', e => {
    if (!isOk(e) || !holdTimer) { held = false; return; }
    clearTimeout(holdTimer); holdTimer = null;
    if (!held && current) press(current);
    held = false;
  });

  function press(el) {
    el.classList.add('is-pressed');
    setTimeout(() => el.classList.remove('is-pressed'), 160);
    el.click();
  }

  document.addEventListener('keydown', e => {
    if (TV.athan && TV.athan.active) { e.preventDefault(); TV.athan.stop(); return; }
    if (wake() && e.key !== 't' && e.key !== 'T') { e.preventDefault(); return; }
    if (TV.remote.intercept && TV.remote.intercept(e)) { e.preventDefault(); return; }
    if (e.key === 'i' || e.key === 'I') { clearTimeout(idleTimer); document.body.classList.add('idle'); return; }
    const dir = DIRS[e.key];
    if (dir) {
      e.preventDefault();
      if (current && current.hasAttribute('data-cycle') && (dir === 'left' || dir === 'right')) {
        current.dispatchEvent(new CustomEvent('cycle', { detail: dir === 'left' ? -1 : 1 }));
        return;
      }
      return move(dir);
    }
    if (isOk(e)) {
      e.preventDefault();
      if (!current) return;
      // remotes send repeats while OK is held: the first repeat means "hold"
      if (e.repeat) { if (holdTimer && !held) { held = true; current.dispatchEvent(new Event('hold')); } return; }
      if (!current.hasAttribute('data-hold')) return press(current);
      held = false;
      const el = current;
      holdTimer = setTimeout(() => { if (!held) { held = true; el.dispatchEvent(new Event('hold')); } }, 450);
      return;
    }
    if (e.key === 'ContextMenu' || e.key === 'm' || e.key === 'M') { if (current && current.hasAttribute('data-hold')) current.dispatchEvent(new Event('hold')); return; }
    if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
      const top = scope();
      if (top.classList.contains('layer')) { e.preventDefault(); top.dispatchEvent(new Event('close')); }
      return;
    }
    if (e.key === 'a' || e.key === 'A') TV.athan && TV.athan.simulate();
    if (e.key === 's' || e.key === 'S') TV.openSettings && TV.openSettings();
  });

  // mouse support for testing on a PC (right-click = hold)
  document.addEventListener('contextmenu', e => {
    const el = e.target.closest('[data-hold]'); if (el) { e.preventDefault(); focus(el); el.dispatchEvent(new Event('hold')); }
  });
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-focus]');
    if (el && items().includes(el)) focus(el);
  });

  TV.remote = {
    focus, move, intercept: null, slide: slideTrack,
    get current() { return current; },
    focusFirst(root) { const el = (root || scope()).querySelector('[data-autofocus]') || (root || scope()).querySelector('[data-focus]'); focus(el); },
    reset() { if (current) current.classList.remove('is-focused'); current = null; },
  };
})();
