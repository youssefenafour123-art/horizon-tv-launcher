/* Athan: full-screen overlay + audio at each prayer time. Any key dismisses.
   Put your recording at assets/athan.mp3 (a soft placeholder tone plays until then). */
window.TV = window.TV || {};

(function () {
  const SRC = (document.currentScript && document.currentScript.dataset.audio) || '../assets/athan.mp3';
  const fired = new Set();
  let audio = null, synth = null, layer = null, endTimer = null;

  function build() {
    layer = document.createElement('div');
    layer.className = 'athan-layer layer';
    layer.innerHTML = `
      <div class="athan-bg"></div>
      <div class="athan-rings"><i></i><i></i><i></i></div>
      <div class="athan-inner">
        <div class="athan-kicker">حان الآن موعد أذان</div>
        <div class="athan-name-ar"></div>
        <div class="athan-name"></div>
        <div class="athan-meta"></div>
        <div class="athan-progress"><i></i></div>
        <div class="athan-hint">Press any button to stop</div>
      </div>`;
    layer.addEventListener('click', stop);
    document.getElementById('stage').appendChild(layer);
  }

  function show(key, time) {
    if (!layer) build();
    const P = TV.prayer, loc = TV.state.location || {};
    layer.querySelector('.athan-name-ar').textContent = P.AR[key];
    layer.querySelector('.athan-name').textContent = `It's time for ${P.NAMES[key]}`;
    layer.querySelector('.athan-meta').textContent = `${TV.fmt.time(time, true)}  ·  ${loc.city || ''}`;
    layer.dataset.prayer = key;
    requestAnimationFrame(() => layer.classList.add('open'));
    document.body.classList.add('athan-on');
    api.active = true;
    play(key);
  }

  function play(key) {
    stopAudio();
    audio = new Audio(key === 'fajr' && api.fajrSrc ? api.fajrSrc : SRC);
    audio.volume = 0;
    const bar = layer.querySelector('.athan-progress i');
    bar.style.transform = 'scaleX(0)';
    audio.addEventListener('timeupdate', () => { if (audio && audio.duration) bar.style.transform = `scaleX(${audio.currentTime / audio.duration})`; });
    // gentle fade-in so it never startles
    const fade = setInterval(() => { if (!audio) return clearInterval(fade); const max = TV.settings.athanVol || 1; audio.volume = Math.min(max, audio.volume + .05); if (audio.volume >= max) clearInterval(fade); }, 80);
    audio.addEventListener('ended', stop);
    audio.addEventListener('error', placeholder);
    audio.play().catch(placeholder);
  }

  // gentle synthesized pad so the flow can be tested without a recording
  function placeholder() {
    if (synth || !api.active) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.5);
      const notes = [293.66, 349.23, 392, 440, 392, 349.23, 329.63, 293.66];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        const t = ctx.currentTime + i * 1.6;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.5); g.gain.linearRampToValueAtTime(0, t + 1.9);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 2);
      });
      synth = { ctx, master };
      endTimer = setTimeout(stop, notes.length * 1600 + 1500);
    } catch {}
  }

  function stopAudio() {
    if (audio) { audio.pause(); audio = null; }
    if (synth) { const s = synth; synth = null; try { s.master.gain.linearRampToValueAtTime(0, s.ctx.currentTime + 0.4); setTimeout(() => s.ctx.close(), 500); } catch {} }
    clearTimeout(endTimer);
  }

  function stop() {
    if (!api.active) return;
    api.active = false;
    stopAudio();
    layer.classList.remove('open');
    document.body.classList.remove('athan-on');
  }

  // called every second by the launcher
  function check(state) {
    if (window.Horizon) return; // on the TV, Android's alarms play the athan
    if (!TV.settings.athan || api.active) return;
    const now = state.now.getTime();
    for (const k of TV.prayer.SALAH) {
      if (TV.settings.athanOn && TV.settings.athanOn[k] === false) continue;
      const t = state.times[k].getTime(), id = k + t;
      if (now >= t && now - t < 60000 && !fired.has(id)) { fired.add(id); show(k, state.times[k]); return; }
    }
  }

  const api = {
    active: false, check, stop, fajrSrc: null,
    simulate() {
      const n = TV.state.next || { key: 'maghrib', time: new Date() };
      if (window.Horizon) { window.Horizon.testAthan(n.key, TV.prayer.NAMES[n.key], TV.prayer.AR[n.key], TV.fmt.time(n.time, true), (TV.state.location || {}).city || ''); return; }
      show(n.key, n.time);
    },
  };
  TV.athan = api;
})();
