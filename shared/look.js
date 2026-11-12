/* Appearance: font styles, clock size/weight, accent color, home-screen toggles, wallpaper dim/parallax.
   Only the chosen font style is downloaded, so switching stays light. */
window.TV = window.TV || {};

(function () {
  const G = 'https://fonts.googleapis.com/css2?display=swap&';
  const FONTS = {
    modern:    { name: 'Modern',    display: 'Outfit',              text: 'Plus Jakarta Sans', ar: 'Noto Kufi Arabic',     track: -0.05,
                 q: 'family=Outfit:wght@100;200;300;400;500&family=Plus+Jakarta+Sans:wght@300;400;500;600&family=Noto+Kufi+Arabic:wght@300;400;500;600' },
    elegant:   { name: 'Elegant',   display: 'Instrument Serif',    text: 'Plus Jakarta Sans', ar: 'Amiri',                track: -0.01, serif: true,
                 q: 'family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@300;400;500;600&family=Amiri:wght@400;700' },
    editorial: { name: 'Editorial', display: 'Fraunces',            text: 'Figtree',           ar: 'Noto Naskh Arabic',    track: -0.035, serif: true,
                 q: 'family=Fraunces:opsz,wght@9..144,100;9..144,200;9..144,300;9..144,400;9..144,500&family=Figtree:wght@300;400;500;600&family=Noto+Naskh+Arabic:wght@400;500;600' },
    rounded:   { name: 'Rounded',   display: 'Readex Pro',          text: 'Readex Pro',        ar: 'Readex Pro',           track: -0.045,
                 q: 'family=Readex+Pro:wght@160;200;300;400;500;600' },
    minimal:   { name: 'Minimal',   display: 'Geist',               text: 'Geist',             ar: 'Noto Kufi Arabic',     track: -0.055,
                 q: 'family=Geist:wght@100;200;300;400;500;600&family=Noto+Kufi+Arabic:wght@300;400;500;600' },
    tech:      { name: 'Tech',      display: 'Space Grotesk',       text: 'Space Grotesk',     ar: 'IBM Plex Sans Arabic', track: -0.045,
                 q: 'family=Space+Grotesk:wght@300;400;500;600&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600' },
    bold:      { name: 'Bold',      display: 'Bricolage Grotesque', text: 'Bricolage Grotesque', ar: 'Cairo',              track: -0.045,
                 q: 'family=Bricolage+Grotesque:opsz,wght@12..96,200;12..96,300;12..96,400;12..96,500;12..96,700;12..96,800&family=Cairo:wght@300;400;500;600;700' },
  };
  const SIZES = { m: { name: 'Medium', px: 190 }, l: { name: 'Large', px: 236 }, xl: { name: 'Huge', px: 290 } };
  const WEIGHTS = { thin: { name: 'Thin', w: 200 }, light: { name: 'Light', w: 300 }, regular: { name: 'Regular', w: 400 }, bold: { name: 'Bold', w: 600 } };
  const ACCENTS = {
    auto: { name: 'Follows the sky' },
    gold: { name: 'Gold', c: '#ffcf7a' }, pearl: { name: 'Pearl', c: '#ffffff' }, mint: { name: 'Mint', c: '#8ff0c4' },
    rose: { name: 'Rose', c: '#ffaac4' }, sky: { name: 'Sky', c: '#93ccff' }, lilac: { name: 'Lilac', c: '#c8b4ff' },
  };
  // accent that follows the light outside
  const PHASE_ACCENT = { night: '#aebcff', dawn: '#c9b2ff', sunrise: '#ffc493', morning: '#ffe2a6', noon: '#fff3d6', afternoon: '#ffd67e', golden: '#ffbb62', sunset: '#ff9f80', dusk: '#d9a8ff' };

  const loaded = new Set();
  function loadFont(key) {
    if (loaded.has(key)) return;
    loaded.add(key);
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = G + FONTS[key].q; document.head.appendChild(l);
  }

  let phase = 'night';
  function apply() {
    const s = TV.settings, r = document.documentElement.style, f = FONTS[s.font] || FONTS.modern;
    loadFont(s.font in FONTS ? s.font : 'modern');
    r.setProperty('--f-display', `'${f.display}', system-ui, sans-serif`);
    r.setProperty('--f-text', `'${f.text}', system-ui, sans-serif`);
    r.setProperty('--f-ar', `'${f.ar}', sans-serif`);
    r.setProperty('--clock-size', (SIZES[s.clockSize] || SIZES.l).px + 'px');
    r.setProperty('--clock-weight', f.serif && f.display === 'Instrument Serif' ? 400 : (WEIGHTS[s.clockWeight] || WEIGHTS.thin).w);
    r.setProperty('--clock-track', f.track + 'em');
    r.setProperty('--accent', s.accent === 'auto' || !ACCENTS[s.accent] ? PHASE_ACCENT[phase] : ACCENTS[s.accent].c);
    r.setProperty('--dim', s.dim);
    const b = document.body.classList;
    b.toggle('serif', !!f.serif);
    b.toggle('no-seconds', !s.seconds);
    b.toggle('no-greeting', !s.greeting);
    b.toggle('no-verse', !s.verse);
    b.toggle('no-timeline', !s.timeline);
    b.toggle('no-parallax', !s.parallax);
    b.toggle('no-matches', s.matches === false);
  }

  document.addEventListener('tv:phase', e => { phase = e.detail; if (TV.settings.accent === 'auto') apply(); });

  Object.assign(TV.settings, Object.assign({
    font: 'modern', clockSize: 'l', clockWeight: 'thin', accent: 'auto', seconds: true,
    greeting: true, verse: true, verseEvery: 30, appOrder: [], timeline: true, idle: 1, wallMode: 'live', dim: 0, parallax: !window.Horizon, // parallax moves the whole screen: off by default on the TV
    matches: true, matchComps: {}, photoEvery: 60, athanVol: 1, athanOn: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
  }, TV.settings));

  TV.look = { FONTS, SIZES, WEIGHTS, ACCENTS, apply };
})();
