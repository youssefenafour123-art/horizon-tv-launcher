/* D-pad focus engine (adapted from Horizon's shared/remote.js).
   [data-focus]   focusable element (OK = click)
   [data-row]     horizontal strip that slides (transform) to keep the focused tile in view; up/down remember the column
   [data-cycle]   left/right change its value instead of moving focus (fires a 'cycle' event)
   .layer.open    modal layer: focus is trapped inside the topmost one */
window.R = window.R || {};

(function () {
  let current = null;

  const scope = () => {
    const layers = [...document.querySelectorAll('.layer.open')];
    return layers.length ? layers[layers.length - 1] : null;
  };
  const items = root => [...(root || scope() || document).querySelectorAll('[data-focus]')]
    .filter(el => el.getClientRects().length);

  function focus(el) {
    if (!el || el === current) return;
    if (current) current.classList.remove('is-focused');
    current = el;
    el.classList.add('is-focused');
    const row = el.closest('[data-row]');
    if (row) { row._last = el; slide(row, el); }
    document.dispatchEvent(new CustomEvent('r:focus', { detail: el }));
  }

  // keep the focused tile inside the visible strip, sliding the row with a transform
  function slide(row, el) {
    const viewW = row.parentElement.clientWidth;
    const pad = +(row.dataset.row || 0) || 60;
    const left = el.offsetLeft, right = left + el.offsetWidth;
    let x = row._x || 0;
    if (left + x < pad) x = pad - left;
    if (right + x > viewW - pad) x = viewW - pad - right;
    x = Math.min(0, Math.max(x, Math.min(0, viewW - row.scrollWidth - pad)));
    if (x !== row._x) { row._x = x; row.style.transform = `translate3d(${x}px,0,0)`; }
  }

  function move(dir) {
    const list = items();
    if (!current || !list.includes(current)) return focus(list[0]);
    const row = current.closest('[data-row]');
    // inside a row, left/right is simply the neighbour
    if (row && (dir === 'left' || dir === 'right')) {
      let n = current;
      do n = dir === 'right' ? n.nextElementSibling : n.previousElementSibling; while (n && !n.hasAttribute('data-focus'));
      return n ? focus(n) : bump(dir);
    }
    const a = current.getBoundingClientRect();
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === current) continue;
      const b = el.getBoundingClientRect();
      let gap, side;
      if (dir === 'down') { if (b.top < a.bottom - 4) continue; gap = b.top - a.bottom; side = Math.abs((b.left + b.right) - (a.left + a.right)) / 2; }
      if (dir === 'up') { if (b.bottom > a.top + 4) continue; gap = a.top - b.bottom; side = Math.abs((b.left + b.right) - (a.left + a.right)) / 2; }
      if (dir === 'right') { if (b.left < a.right - 4) continue; gap = b.left - a.right; side = Math.abs((b.top + b.bottom) - (a.top + a.bottom)) / 2; }
      if (dir === 'left') { if (b.right > a.left + 4) continue; gap = a.left - b.right; side = Math.abs((b.top + b.bottom) - (a.top + a.bottom)) / 2; }
      const score = gap * 1.5 + side;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (!best) return bump(dir);
    // entering another row: go back to the tile last focused there
    const target = best.closest('[data-row]');
    if (target && target !== row && target._last && list.includes(target._last)) best = target._last;
    focus(best);
  }

  function bump(dir) {
    if (!current) return;
    const el = current, k = 'bump-' + dir[0];
    el.classList.remove(k); void el.offsetWidth; el.classList.add(k);
    setTimeout(() => el.classList.remove(k), 260);
  }

  const DIRS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

  document.addEventListener('keydown', e => {
    if (R.intercept && R.intercept(e)) { e.preventDefault(); return; }
    const top = scope();
    const dir = DIRS[e.key];
    if (!top) { R.wallKey && R.wallKey(e); return; }
    if (dir) {
      e.preventDefault();
      if (current && current.hasAttribute('data-cycle') && (dir === 'left' || dir === 'right')) {
        current.dispatchEvent(new CustomEvent('cycle', { detail: dir === 'left' ? -1 : 1 }));
        return;
      }
      return move(dir);
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.repeat || !current) return;
      current.classList.add('is-pressed');
      setTimeout(() => current && current.classList.remove('is-pressed'), 160);
      current.click();
      return;
    }
    if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
      e.preventDefault();
      top.dispatchEvent(new Event('close'));
    }
  });

  // mouse support for trying it on a PC
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-focus]');
    if (el && items().includes(el)) focus(el);
  });

  R.focus = focus;
  R.move = move;
  R.slide = slide;
  R.items = items;
  Object.defineProperty(R, 'current', { get: () => current });
  R.reset = () => { if (current) current.classList.remove('is-focused'); current = null; };
})();
