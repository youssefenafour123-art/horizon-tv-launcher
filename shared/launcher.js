/* Launcher core: 1080p stage scaling, settings, location, clock + prayer state, apps, toast.
   A version calls TV.start({ onTick(state), onTimes(state) }). */
window.TV = window.TV || {};

(function () {
  /* ---------- stage: design at 1920x1080, scale to any screen ---------- */
  function fit() {
    // the visible area (some TV WebViews report a stretched innerWidth)
    const w = document.documentElement.clientWidth || innerWidth, h = document.documentElement.clientHeight || innerHeight;
    const s = Math.min(w / 1920, h / 1080);
    const st = document.getElementById('stage');
    st.style.transform = `translate(-50%,-50%) scale(${s})`;
  }
  addEventListener('resize', fit);

  /* ---------- storage (never throws) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tvl.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('tvl.' + k, JSON.stringify(v)); } catch {} },
  };

  const CITIES = [
    { city: 'Casablanca', cc: 'MA', lat: 33.5731, lng: -7.5898 },
    { city: 'Rabat', cc: 'MA', lat: 34.0209, lng: -6.8416 },
    { city: 'Marrakech', cc: 'MA', lat: 31.6295, lng: -7.9811 },
    { city: 'Fès', cc: 'MA', lat: 34.0181, lng: -5.0078 },
    { city: 'Tanger', cc: 'MA', lat: 35.7595, lng: -5.8340 },
    { city: 'Agadir', cc: 'MA', lat: 30.4278, lng: -9.5981 },
    { city: 'Oujda', cc: 'MA', lat: 34.6814, lng: -1.9086 },
    { city: 'Makkah', cc: 'SA', lat: 21.4225, lng: 39.8262 },
    { city: 'Madinah', cc: 'SA', lat: 24.4672, lng: 39.6111 },
    { city: 'Riyadh', cc: 'SA', lat: 24.7136, lng: 46.6753 },
    { city: 'Dubai', cc: 'AE', lat: 25.2048, lng: 55.2708 },
    { city: 'Cairo', cc: 'EG', lat: 30.0444, lng: 31.2357 },
    { city: 'Algiers', cc: 'DZ', lat: 36.7538, lng: 3.0588 },
    { city: 'Tunis', cc: 'TN', lat: 36.8065, lng: 10.1815 },
    { city: 'Istanbul', cc: 'TR', lat: 41.0082, lng: 28.9784 },
    { city: 'Paris', cc: 'FR', lat: 48.8566, lng: 2.3522 },
    { city: 'Brussels', cc: 'BE', lat: 50.8503, lng: 4.3517 },
    { city: 'Amsterdam', cc: 'NL', lat: 52.3676, lng: 4.9041 },
    { city: 'London', cc: 'GB', lat: 51.5072, lng: -0.1276 },
    { city: 'Madrid', cc: 'ES', lat: 40.4168, lng: -3.7038 },
    { city: 'New York', cc: 'US', lat: 40.7128, lng: -74.0060 },
  ];

  const defaults = { auto: true, method: null, asr: 1, athan: true, clock24: true, location: null };
  const settings = Object.assign({}, defaults, store.get('settings', {}));
  const saveSettings = () => { store.set('settings', settings); scheduleNative(); };

  /* ---------- location: cached -> IP -> GPS refine -> manual ---------- */
  async function ipLookup() {
    const tries = [
      ['https://ipwho.is/', j => j.success !== false && { city: j.city, cc: j.country_code, lat: j.latitude, lng: j.longitude }],
      ['https://ipapi.co/json/', j => j.latitude && { city: j.city, cc: j.country_code, lat: j.latitude, lng: j.longitude }],
    ];
    for (const [url, map] of tries) {
      try {
        const ctl = new AbortController(); setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(url, { signal: ctl.signal });
        const loc = map(await r.json());
        if (loc && isFinite(loc.lat)) return loc;
      } catch {}
    }
    return null;
  }
  function gps() {
    return new Promise(res => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(
        p => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => res(null), { timeout: 6000, maximumAge: 864e5 });
    });
  }
  async function resolveLocation(force) {
    if (!settings.auto && settings.location) return settings.location;
    const cached = store.get('autoLoc');
    if (cached && !force) { refreshAuto(); return cached; }
    return refreshAuto();
  }
  async function refreshAuto() {
    const ip = await ipLookup();
    const g = await gps();
    const loc = ip ? { ...ip } : (g ? { city: 'My location', cc: '', ...g } : null);
    if (!loc) return store.get('autoLoc') || CITIES[0];
    if (g) Object.assign(loc, g);
    const prev = store.get('autoLoc');
    store.set('autoLoc', loc);
    if (settings.auto && prev && (Math.abs(prev.lat - loc.lat) > 0.05 || Math.abs(prev.lng - loc.lng) > 0.05)) {
      state.location = loc; recompute();
    }
    return loc;
  }

  /* ---------- prayer state ---------- */
  const state = { now: new Date(), location: null, method: 'mwl', times: null, list: [], next: null, prev: null, progress: 0, remaining: 0 };
  let hooks = {};
  let dayKey = '';

  function recompute() {
    const P = TV.prayer, loc = state.location;
    state.method = settings.method || P.methodFor(loc.cc);
    const d = new Date(), y = new Date(d); y.setDate(d.getDate() - 1);
    const tm = new Date(d); tm.setDate(d.getDate() + 1);
    state.times = P.getTimes(loc.lat, loc.lng, d, state.method, settings.asr);
    state.yesterday = P.getTimes(loc.lat, loc.lng, y, state.method, settings.asr);
    state.tomorrow = P.getTimes(loc.lat, loc.lng, tm, state.method, settings.asr);
    state.list = P.ORDER.map(k => ({ key: k, name: P.NAMES[k], ar: P.AR[k], time: state.times[k], salah: k !== 'sunrise' }));
    dayKey = d.toDateString();
    state.showingTomorrow = false;
    tick(true);
    hooks.onTimes && hooks.onTimes(state);
    scheduleNative();
  }

  function tick(silent) {
    const now = state.now = new Date();
    if (now.toDateString() !== dayKey && state.location) return recompute();
    const salah = TV.prayer.SALAH;
    let next = null, prev = null;
    for (const k of salah) {
      if (state.times[k] > now) { next = { key: k, time: state.times[k] }; break; }
      prev = { key: k, time: state.times[k] };
    }
    if (!next) next = { key: 'fajr', time: state.tomorrow.fajr, tomorrow: true };
    if (!prev) prev = { key: 'isha', time: state.yesterday.isha };
    for (const p of [next, prev]) { p.name = TV.prayer.NAMES[p.key]; p.ar = TV.prayer.AR[p.key]; }
    state.next = next; state.prev = prev;
    state.remaining = next.time - now;
    state.progress = Math.min(1, Math.max(0, (now - prev.time) / (next.time - prev.time)));
    // after Isha the schedule rolls over to tomorrow, with Fajr up next
    const showTomorrow = !!next.tomorrow;
    if (showTomorrow !== !!state.showingTomorrow) {
      state.showingTomorrow = showTomorrow;
      const src = showTomorrow ? state.tomorrow : state.times;
      state.list.forEach(p => { p.time = src[p.key]; });
      hooks.onTimes && hooks.onTimes(state);
    }
    state.list.forEach(p => { p.isNext = p.key === next.key; p.past = !showTomorrow && p.time <= now; });
    if (!silent) TV.athan && TV.athan.check(state);
    hooks.onTick && hooks.onTick(state);
  }

  /* ---------- Hijri: Umm al-Qura numbers from the system calendar, our own month names ----------
     Some TV WebViews ship the calendar math without the month names, so only the numbers are trusted.
     Without any Islamic calendar, a tabular calculation is used. Settings > Prayer > Hijri date shifts ±days. */
  const HM_EN = ['Muharram', 'Safar', 'Rabiʿ al-Awwal', 'Rabiʿ al-Thani', 'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', 'Shaʿban', 'Ramadan', 'Shawwal', 'Dhu al-Qaʿdah', 'Dhu al-Hijjah'];
  const HM_AR = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
  const arNum = n => String(n).replace(/\d/g, c => '٠١٢٣٤٥٦٧٨٩'[c]);
  const umm = (() => {
    try {
      const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' });
      return /islamic/.test(f.resolvedOptions().calendar) ? f : null;
    } catch { return null; }
  })();
  function tabular(date) {
    const jd = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5) + 2440588;
    let l = jd - 1948440 + 10632; const n = Math.floor((l - 1) / 10631); l = l - 10631 * n + 354;
    const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
    l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
    const m = Math.floor((24 * l) / 709);
    return [l - Math.floor((709 * m) / 24), m, 30 * n + j - 30];
  }
  function hijriParts(d) {
    const x = new Date(d); x.setDate(x.getDate() + (settings.hijriAdj || 0));
    if (umm) {
      try {
        const p = umm.formatToParts(x), g = t => parseInt((p.find(q => q.type === t) || {}).value, 10);
        const out = [g('day'), g('month'), g('year') || g('relatedYear')];
        if (out.every(v => v > 0) && out[1] <= 12) return out;
      } catch {}
    }
    return tabular(x);
  }

  /* ---------- formatting ---------- */
  const pad = n => String(n).padStart(2, '0');
  const fmt = {
    time(d, withSuffix) {
      let h = d.getHours(); const m = pad(d.getMinutes());
      if (settings.clock24) return `${pad(h)}:${m}`;
      const s = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
      return withSuffix ? `${h}:${m} ${s}` : `${h}:${m}`;
    },
    ampm: d => settings.clock24 ? '' : (d.getHours() >= 12 ? 'PM' : 'AM'),
    countdown(ms, long) {
      const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
      if (long) return h ? `${h}h ${pad(m)}m` : `${m}m ${pad(s)}s`;
      return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    },
    date: d => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
    weekday: d => d.toLocaleDateString('en-GB', { weekday: 'long' }),
    dayMonth: d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }),
    hijri(d) { const [day, m, y] = hijriParts(d); return `${day} ${HM_EN[m - 1]} ${y} AH`; },
    hijriAr(d) { const [day, m, y] = hijriParts(d); return `${arNum(day)} ${HM_AR[m - 1]} ${arNum(y)} هـ`; },
  };

  /* ---------- apps (the real APK reads installed apps) ---------- */
  const ICONS = {
    play:   '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
    film:   '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4M3 12h18"/>',
    tv:     '<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M8 2.5l4 3.5 4-3.5"/>',
    star:   '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>',
    music:  '<path d="M9 18V5.5l11-2v12.5"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    book:   '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13"/>',
    globe:  '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 015.5 5H10l2 2.5h6.5A2.5 2.5 0 0121 10v7.5a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5z"/>',
    cog:    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    moon:   '<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>',
    wifi:   '<path d="M2.5 9a14 14 0 0119 0M5.5 12.5a9.5 9.5 0 0113 0M8.7 16a5 5 0 016.6 0"/><circle cx="12" cy="19.3" r=".9" fill="currentColor"/>',
    ball:   '<circle cx="12" cy="12" r="9"/><path d="M12 7.5l3.8 2.8-1.5 4.4H9.7L8.2 10.3zM12 3v4.5M15.8 10.3l4.7-1.5M14.3 14.7l2.9 4M9.7 14.7l-2.9 4M8.2 10.3L3.5 8.8"/>',
    input:  '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
  };
  const icon = (name, size = 24, sw = 1.4) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.play}</svg>`;

  // logo: Simple Icons slug (preview only; the real launcher uses each installed app's own banner/icon)
  // mark: custom wordmark when no logo exists · bg: banner color · fg: logo color · glow: focus edge color
  const APPS = [
    { id: 'youtube', name: 'YouTube',     logo: 'youtube',      bg: 'linear-gradient(145deg,#ff2a4d,#d4001f)', fg: '#ffffff', glow: '#ff3d5e' },
    { id: 'netflix', name: 'Netflix',     logo: 'netflix',      bg: 'linear-gradient(145deg,#1a1a1a,#000000)', fg: '#e50914', glow: '#ff2a35' },
    { id: 'shahid',  name: 'Shahid',      mark: 'shahid',       bg: 'linear-gradient(145deg,#18c08f,#0a5e46)', fg: '#ffffff', glow: '#3dffc0' },
    { id: 'prime',   name: 'Prime Video', logo: 'primevideo',   wide: true, bg: 'linear-gradient(145deg,#1b2a3a,#0b131c)', fg: '#1fb6ff', glow: '#3cc2ff' },
    { id: 'quran',   name: 'Quran',       mark: 'القرآن',        ar: true, bg: 'linear-gradient(145deg,#1f4d3a,#0d2a1f)', fg: '#f0cf7e', glow: '#ffd77a' },
    { id: 'spotify', name: 'Spotify',     logo: 'spotify',      bg: 'linear-gradient(145deg,#1d1d1d,#0b0b0b)', fg: '#1ed760', glow: '#2bff79' },
    { id: 'browser', name: 'Chrome',      logo: 'googlechrome', bg: 'linear-gradient(145deg,#ffffff,#e8eaf0)', fg: '#1a73e8', glow: '#6aa8ff' },
    { id: 'plex',    name: 'Plex',        logo: 'plex',         bg: 'linear-gradient(145deg,#2b2f36,#16181c)', fg: '#ebaf00', glow: '#ffc21a' },
    { id: 'files',   name: 'Files',       icon: 'folder',       bg: 'linear-gradient(145deg,#33394a,#1c2030)', fg: '#ffbe5c', glow: '#ffbe5c' },
    { id: 'hdmi',    name: 'Inputs',      icon: 'input',        bg: 'linear-gradient(145deg,#33394a,#1c2030)', fg: '#d6dcea', glow: '#ffffff' },
  ];
  const LOGO_CDN = 'https://cdn.jsdelivr.net/npm/simple-icons@13.21.0/icons/';

  /* ---------- on the TV: real installed apps + native athan alarms ---------- */
  const NATIVE = window.Horizon || null;
  function nativeApps() {
    try { return JSON.parse(NATIVE.apps()).map(a => ({ id: a.pkg, name: a.label, native: true, banner: a.banner, color: a.color, glow: a.color })); }
    catch { return []; }
  }
  // the next 7 days of athans, so alarms keep firing even if the home screen is not opened
  function scheduleNative() {
    if (!NATIVE || !state.location) return;
    const s = settings, loc = state.location, out = [];
    if (s.athan) for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const t = TV.prayer.getTimes(loc.lat, loc.lng, d, state.method, s.asr);
      for (const k of TV.prayer.SALAH) {
        if (s.athanOn && s.athanOn[k] === false) continue;
        out.push({ k, n: TV.prayer.NAMES[k], ar: TV.prayer.AR[k], t: t[k].getTime(), time: fmt.time(t[k], true), city: loc.city || '' });
      }
    }
    try { NATIVE.schedule(JSON.stringify(out), s.athanVol || 1); } catch {}
  }

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(html) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.getElementById('stage').appendChild(el); }
    el.innerHTML = html; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
  function openApp(app) {
    if (NATIVE && app.native) { if (!NATIVE.launch(app.id)) toast(`<span>Couldn't open <b>${app.name}</b></span>`); return; }
    toast(`<span>Opening <b>${app.name}</b>…</span>`);
  }

  const VERSES = [
    { ar: 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا', en: 'Truly, with hardship comes ease.', ref: 'Ash-Sharh 94:5' },
    { ar: 'فَاذْكُرُونِي أَذْكُرْكُمْ', en: 'Remember Me, and I will remember you.', ref: 'Al-Baqarah 2:152' },
    { ar: 'وَهُوَ مَعَكُمْ أَيْنَ مَا كُنتُمْ', en: 'And He is with you wherever you are.', ref: 'Al-Hadid 57:4' },
    { ar: 'أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ', en: 'In the remembrance of Allah do hearts find rest.', ref: "Ar-Ra'd 13:28" },
    { ar: 'وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ', en: 'Seek help through patience and prayer.', ref: 'Al-Baqarah 2:45' },
    { ar: 'إِنَّ اللَّهَ مَعَ الصَّابِرِينَ', en: 'Allah is with those who are patient.', ref: 'Al-Baqarah 2:153' },
    { ar: 'وَقُل رَّبِّ زِدْنِي عِلْمًا', en: 'And say: My Lord, increase me in knowledge.', ref: 'Ta-Ha 20:114' },
    { ar: 'لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا', en: 'Allah does not burden a soul beyond what it can bear.', ref: 'Al-Baqarah 2:286' },
    { ar: 'وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ', en: 'Whoever relies on Allah, He is enough for him.', ref: 'At-Talaq 65:3' },
    { ar: 'إِنَّ الصَّلَاةَ تَنْهَىٰ عَنِ الْفَحْشَاءِ وَالْمُنكَرِ', en: 'Prayer keeps one away from indecency and wrongdoing.', ref: "Al-'Ankabut 29:45" },
    { ar: 'وَلَسَوْفَ يُعْطِيكَ رَبُّكَ فَتَرْضَىٰ', en: 'Your Lord will give you, and you will be content.', ref: 'Ad-Duha 93:5' },
    { ar: 'ادْعُونِي أَسْتَجِبْ لَكُمْ', en: 'Call upon Me; I will answer you.', ref: 'Ghafir 40:60' },
    { ar: 'لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ', en: 'Do not despair of the mercy of Allah.', ref: 'Az-Zumar 39:53' },
    { ar: 'وَإِذَا سَأَلَكَ عِبَادِي عَنِّي فَإِنِّي قَرِيبٌ', en: 'When My servants ask about Me, I am near.', ref: 'Al-Baqarah 2:186' },
    { ar: 'وَرَحْمَتِي وَسِعَتْ كُلَّ شَيْءٍ', en: 'My mercy encompasses all things.', ref: "Al-A'raf 7:156" },
    { ar: 'إِنَّ رَبِّي قَرِيبٌ مُّجِيبٌ', en: 'Indeed, my Lord is near and responsive.', ref: 'Hud 11:61' },
    { ar: 'وَاللَّهُ يُحِبُّ الْمُحْسِنِينَ', en: 'Allah loves those who do good.', ref: "Al 'Imran 3:134" },
    { ar: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ', en: 'Allah is enough for us, and the best guardian.', ref: "Al 'Imran 3:173" },
    { ar: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً', en: 'Our Lord, give us good in this world and good in the Hereafter.', ref: 'Al-Baqarah 2:201' },
    { ar: 'وَقُولُوا لِلنَّاسِ حُسْنًا', en: 'And speak to people kindly.', ref: 'Al-Baqarah 2:83' },
    { ar: 'وَتَوَكَّلْ عَلَى الْحَيِّ الَّذِي لَا يَمُوتُ', en: 'And rely upon the Ever-Living who does not die.', ref: 'Al-Furqan 25:58' },
    { ar: 'سَلَامٌ هِيَ حَتَّىٰ مَطْلَعِ الْفَجْرِ', en: 'Peace it is, until the rising of the dawn.', ref: 'Al-Qadr 97:5' },
    { ar: 'فَصَبْرٌ جَمِيلٌ', en: 'So patience is most fitting.', ref: 'Yusuf 12:18' },
  ];
  function greeting(d) {
    const h = d.getHours();
    const en = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night';
    return { en, ar: h >= 5 && h < 12 ? 'صباح الخير' : 'مساء الخير' };
  }
  // a new verse every N minutes (setting), stepping through the list in a spread-out order
  function verseNow() {
    const mins = settings.verseEvery || 30;
    const slot = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / (mins * 60000));
    const i = (slot * 7) % VERSES.length;
    return { i, v: VERSES[i] };
  }
  const verseOfDay = () => verseNow().v;

  /* ---------- boot ---------- */
  async function start(h) {
    hooks = h || {};
    fit();
    state.location = settings.auto ? (store.get('autoLoc') || CITIES[0]) : (settings.location || CITIES[0]);
    recompute();
    setInterval(() => tick(), 1000);
    resolveLocation().then(loc => { if (loc && loc !== state.location) { state.location = loc; recompute(); } });
    document.body.classList.add('ready');
  }

  Object.assign(TV, {
    start, state, settings, greeting, LOGO_CDN, NATIVE, nativeApps, saveSettings, recompute, refreshAuto, CITIES, APPS: NATIVE ? nativeApps() : APPS, icon, fmt, toast, openApp, store, verseOfDay, verseNow,
    setLocation(loc) { state.location = loc; recompute(); },
  });

  // put these apps first, in this order; all other apps follow in their default order
  TV.setAppOrder = ids => {
    settings.appOrder = ids.filter(Boolean);
    saveSettings();
    document.dispatchEvent(new Event('tv:apps'));
  };

  TV.native = {
    appsChanged() { TV.APPS = nativeApps(); document.dispatchEvent(new Event('tv:apps')); },
    home() {
      TV.closeSettings && TV.closeSettings();
      document.body.classList.remove('idle');
      TV.remote && TV.remote.focusFirst();
    },
    resume() { if (state.location) recompute(); },
  };
})();
