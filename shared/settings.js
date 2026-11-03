/* Settings: sections on the left, options on the right. ◀ ▶ changes a value, Back returns to the sections.
   Every change applies instantly behind the panel and is saved. */
window.TV = window.TV || {};

(function () {
  let layer = null, section = 'look';
  const S = () => TV.settings;
  const save = () => { TV.saveSettings(); TV.look && TV.look.apply(); };
  const onOff = v => v ? 'On' : 'Off';
  const BOOL = () => [true, false];

  // simple setting: key + list of options + label for each
  const opt = (label, key, opts, show, after) => ({ label, opts, get: () => S()[key], set: v => { S()[key] = v; after && after(v); }, show });

  const SECTIONS = [
    { id: 'look', name: 'Appearance', icon: 'star', rows: () => [
      opt('Font style', 'font', () => Object.keys(TV.look.FONTS), v => TV.look.FONTS[v].name),
      opt('Clock size', 'clockSize', () => Object.keys(TV.look.SIZES), v => TV.look.SIZES[v].name),
      opt('Clock weight', 'clockWeight', () => Object.keys(TV.look.WEIGHTS), v => TV.look.WEIGHTS[v].name),
      opt('Accent color', 'accent', () => Object.keys(TV.look.ACCENTS), v => TV.look.ACCENTS[v].name),
      opt('Clock format', 'clock24', BOOL, v => v ? '24-hour' : '12-hour', () => TV.recompute()),
      opt('Seconds', 'seconds', BOOL, onOff),
    ] },
    { id: 'wall', name: 'Wallpaper', icon: 'moon', rows: () => [
      { label: 'Scene', opts: () => Object.keys(TV.sky.SCENES), get: () => TV.sky.scene,
        set: v => { S().scenes = { ...(S().scenes || {}), [location.pathname]: v }; TV.sky.setScene(v); }, show: v => TV.sky.SCENES[v].name },
      opt('Mode', 'wallMode', () => ['live', 'still', 'photos'], v => ({ live: 'Live · animated', still: 'Still · lightest', photos: 'My photos' })[v], v => TV.sky.setMode(v)),
      opt('Dim wallpaper', 'dim', () => [0, .15, .3, .45], v => v ? Math.round(v * 100) + '%' : 'Off'),
      opt('Parallax', 'parallax', BOOL, onOff),
      { label: 'Preview a full day', action: () => { close(); TV.sky.toggleLapse(); }, show: () => 'Press OK' },
    ] },
    { id: 'home', name: 'Home screen', icon: 'tv', rows: () => [
      opt('Greeting', 'greeting', BOOL, onOff),
      opt('Verse', 'verse', BOOL, onOff),
      opt('Verse changes', 'verseEvery', () => [15, 30, 60, 180, 1440], v => v === 1440 ? 'Once a day' : v < 60 ? `Every ${v} min` : `Every ${v / 60} h`),
      { label: 'App order', action: () => { S().appOrder = []; save(); document.dispatchEvent(new Event('tv:apps')); close(); }, show: () => (S().appOrder || []).length ? 'Press OK to reset' : 'Hold OK on an app to move it' },
      opt('Prayer timeline', 'timeline', BOOL, onOff),
      opt('Ambient mode after', 'idle', () => [1, 3, 5, 10, 0], v => v ? `${v} min` : 'Never'),
      ...(window.Horizon ? [
        { label: 'Athan over other apps', action: () => window.Horizon.requestOverlay(), show: () => window.Horizon.canOverlay() ? 'Allowed' : 'Press OK to allow' },
        { label: 'Android TV settings', action: () => window.Horizon.openTvSettings(), show: () => 'Press OK' },
      ] : []),
    ] },
    { id: 'prayer', name: 'Prayer times', icon: 'book', rows: () => [
      { label: 'Location', opts: () => ['auto', ...TV.CITIES.map((_, i) => i)],
        get: () => S().auto ? 'auto' : TV.CITIES.findIndex(c => c.city === (S().location || {}).city),
        set: v => {
          if (v === 'auto') { S().auto = true; TV.setLocation(TV.store.get('autoLoc') || TV.CITIES[0]); TV.refreshAuto(); }
          else { S().auto = false; S().location = TV.CITIES[v]; TV.setLocation(TV.CITIES[v]); }
        },
        show: v => v === 'auto' ? `Auto · ${(TV.store.get('autoLoc') || TV.state.location || {}).city || 'detecting…'}` : (TV.CITIES[v] || {}).city || '—' },
      { label: 'Calculation', opts: () => ['auto', ...Object.keys(TV.prayer.METHODS)], get: () => S().method || 'auto',
        set: v => { S().method = v === 'auto' ? null : v; TV.recompute(); },
        show: v => v === 'auto' ? `Auto · ${TV.prayer.METHODS[TV.state.method].name}` : TV.prayer.METHODS[v].name },
      opt('Asr', 'asr', () => [1, 2], v => v === 1 ? 'Standard' : 'Hanafi', () => TV.recompute()),
      { label: 'Hijri date', opts: () => [-2, -1, 0, 1, 2], get: () => S().hijriAdj || 0, set: v => { S().hijriAdj = v; TV.recompute(); },
        show: v => `${TV.fmt.hijri(new Date())}${v ? `  (${v > 0 ? '+' : ''}${v} day${Math.abs(v) > 1 ? 's' : ''})` : ''}` },
    ] },
    { id: 'athan', name: 'Athan', icon: 'music', rows: () => [
      opt('Athan', 'athan', BOOL, onOff),
      opt('Volume', 'athanVol', () => [.4, .6, .8, 1], v => Math.round(v * 100) + '%'),
      ...TV.prayer.SALAH.map(k => ({ label: TV.prayer.NAMES[k], opts: BOOL, get: () => S().athanOn[k] !== false,
        set: v => { S().athanOn = { ...S().athanOn, [k]: v }; }, show: v => v ? 'Athan' : 'Silent' })),
      { label: 'Test athan', action: () => { close(); setTimeout(() => TV.athan.simulate(), 300); }, show: () => 'Press OK' },
    ] },
  ];

  function build() {
    layer = document.createElement('div');
    layer.className = 'settings-layer layer';
    layer.innerHTML = `
      <div class="settings-scrim"></div>
      <div class="settings-panel">
        <nav class="set-nav">
          <div class="settings-title">Settings</div>
          ${SECTIONS.map(s => `<button class="set-tab" data-focus data-tab="${s.id}">${TV.icon(s.icon, 22)}<span>${s.name}</span></button>`).join('')}
          <div class="settings-sub">◀ ▶ change · Back to menu</div>
        </nav>
        <div class="set-body"><div class="set-head"></div><div class="settings-rows"></div></div>
      </div>`;
    document.getElementById('stage').appendChild(layer);
    layer.querySelectorAll('.set-tab').forEach(t => {
      t.addEventListener('click', () => { show(t.dataset.tab); TV.remote.focusFirst(layer.querySelector('.settings-rows')); });
    });
    // landing on a tab switches the page, like Android TV settings
    document.addEventListener('tv:focus', e => { const t = e.detail.closest && e.detail.closest('.set-tab'); if (t && t.dataset.tab !== section) show(t.dataset.tab); });
    // Right (or OK) from a section always enters at its first option
    document.addEventListener('keydown', e => {
      const cur = TV.remote.current;
      if (e.key === 'ArrowRight' && cur && cur.classList.contains('set-tab') && layer.classList.contains('open')) {
        e.preventDefault(); e.stopImmediatePropagation(); TV.remote.focusFirst(layer.querySelector('.settings-rows'));
      }
    }, true);
    layer.querySelector('.settings-scrim').addEventListener('click', close);
    layer.addEventListener('close', () => {
      const cur = TV.remote.current;
      if (cur && cur.closest('.settings-rows')) TV.remote.focus(layer.querySelector(`[data-tab="${section}"]`));
      else close();
    });
  }

  function show(id) {
    section = id;
    const sec = SECTIONS.find(s => s.id === id);
    layer.querySelectorAll('.set-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === id));
    layer.querySelector('.set-head').textContent = sec.name;
    const box = layer.querySelector('.settings-rows');
    const rows = sec.rows();
    box.innerHTML = rows.map((r, i) => `
      <button class="set-row${r.action ? ' act' : ''}" data-focus ${r.action ? '' : 'data-cycle'} data-i="${i}">
        <span class="set-label">${r.label}</span>
        <span class="set-value">${r.action ? '' : '<i class="set-arrow">‹</i>'}<span class="set-text"></span>${r.action ? '' : '<i class="set-arrow">›</i>'}</span>
      </button>`).join('');
    const paintAll = () => box.querySelectorAll('.set-row').forEach(x => {
      const r = rows[+x.dataset.i]; x.querySelector('.set-text').textContent = r.show(r.action ? null : r.get());
    });
    paintAll();
    box.querySelectorAll('.set-row').forEach(el => {
      const r = rows[+el.dataset.i];
      if (r.action) { el.addEventListener('click', r.action); return; }
      const step = dir => {
        const o = r.opts(), i = Math.max(0, o.findIndex(x => x === r.get()));
        r.set(o[(i + dir + o.length) % o.length]);
        save(); paintAll();
        el.classList.remove('nudge-l', 'nudge-r'); void el.offsetWidth; el.classList.add(dir < 0 ? 'nudge-l' : 'nudge-r');
      };
      el.addEventListener('cycle', e => step(e.detail));
      el.addEventListener('click', () => step(1));
    });
    box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
  }

  let returnTo = null;
  function open(to) {
    if (!layer) build();
    if (layer.classList.contains('open')) return;
    returnTo = TV.remote.current;
    show(to || section);
    layer.classList.add('open');
    TV.remote.focus(layer.querySelector(`[data-tab="${section}"]`));
  }
  function close() {
    if (!layer || !layer.classList.contains('open')) return;
    layer.classList.remove('open');
    TV.remote.reset();
    TV.remote.focus(returnTo);
  }

  TV.openSettings = open;
  TV.closeSettings = close;
})();
