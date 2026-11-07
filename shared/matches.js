/* Matches of the day: La Liga, Premier League, Serie A, Ligue 1, Champions League, Europa League,
   Conference League and Morocco's national team, from ESPN's public scoreboard (no key needed).
   Light by design: one small request per competition, only the fields we show are kept, nothing runs
   while another app is on screen, and live games refresh once a minute (otherwise every 15 min). */
window.TV = window.TV || {};

(function () {
  const API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
  const COMPS = [
    { id: 'mar',  tag: '🇲🇦',  name: 'Morocco', team: 2869, fav: true },
    { id: 'rma',  tag: 'CUP',  name: 'Real Madrid', team: 86, fav: true }, // favorite: also its cup games
    { id: 'ucl',  tag: 'UCL',  name: 'Champions League', code: 'uefa.champions' },
    { id: 'uel',  tag: 'UEL',  name: 'Europa League', code: 'uefa.europa' },
    { id: 'uecl', tag: 'UECL', name: 'Conference League', code: 'uefa.europa.conf' },
    { id: 'pl',   tag: 'PL',   name: 'Premier League', code: 'eng.1' },
    { id: 'll',   tag: 'LL',   name: 'LaLiga', code: 'esp.1' },
    { id: 'sa',   tag: 'SA',   name: 'Serie A', code: 'ita.1' },
    { id: 'l1',   tag: 'L1',   name: 'Ligue 1', code: 'fra.1' },
  ];
  const RANK = Object.fromEntries(COMPS.map((c, i) => [c.id, i]));
  const FAV_TEAMS = COMPS.filter(c => c.fav);
  // a team schedule lists every competition: file each game under its own (Real Madrid in LaLiga stays in LaLiga)
  const LEAGUE = n => /conference/i.test(n) ? 'uecl' : /europa/i.test(n) ? 'uel' : /champions/i.test(n) ? 'ucl' : /laliga|la liga/i.test(n) ? 'll' : null;
  const on = c => TV.settings.matches !== false && (TV.settings.matchComps || {})[c.id] !== false;

  const pad = n => String(n).padStart(2, '0');
  const dayOf = off => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return d; };
  const key = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

  // small crest through ESPN's image resizer (the originals are 500 px)
  const crest = url => {
    if (!url) return '';
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    return `https://a.espncdn.com/combiner/i?img=${path}&w=64&h=64`;
  };
  const score = s => s == null ? '' : typeof s === 'object' ? (s.displayValue ?? s.value ?? '') : String(s);

  function slim(e, comp) {
    const c = e.competitions && e.competitions[0]; if (!c) return null;
    const t = c.competitors || [];
    const h = t.find(x => x.homeAway === 'home') || t[0], a = t.find(x => x.homeAway === 'away') || t[1];
    if (!h || !a) return null;
    const status = c.status || e.status || {}, type = status.type || {};
    const side = x => ({ id: String(x.team.id), code: x.team.abbreviation || (x.team.shortDisplayName || '').slice(0, 3).toUpperCase(),
      logo: crest(x.team.logo || (x.team.logos && x.team.logos[0] && x.team.logos[0].href)), s: score(x.score) });
    let state = type.state === 'in' ? 'live' : type.state === 'post' ? 'post' : 'pre', min = '';
    if (state === 'live') min = /HALF/.test(type.name || '') ? 'HT' : (status.displayClock || "'");
    if (/POSTPONED|CANCELED|SUSPENDED/.test(type.name || '')) { state = 'off'; min = 'PPD'; }
    let cid = comp.id;
    if (comp.id === 'rma') { const lg = e.league || (e.competitions[0].league) || {}; cid = LEAGUE(lg.abbreviation || lg.name || '') || 'rma'; }
    const m = { id: e.id, comp: cid, start: Date.parse(e.date), state, min, h: side(h), a: side(a) };
    m.fav = comp.fav || FAV_TEAMS.some(f => m.h.id === String(f.team) || m.a.id === String(f.team));
    return m;
  }

  const get = url => fetch(url, { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject(r.status));

  // favorite teams (Morocco, Real Madrid): their full schedule, every competition; refreshed hourly
  const teams = {};
  async function team(comp) {
    const t = teams[comp.id] || (teams[comp.id] = { at: 0, list: [] });
    if (Date.now() - t.at < 3600e3 && t.list.length) return t.list;
    const out = [];
    for (const q of ['?fixture=true', '']) {
      try { const d = await get(`${API}all/teams/${comp.team}/schedule${q}`); (d.events || []).forEach(e => { const m = slim(e, comp); if (m) out.push(m); }); } catch (e) { }
    }
    if (out.length) { t.at = Date.now(); t.list = out; }
    return t.list;
  }

  const cache = new Map(); // day key → { at, list }
  async function load(off, force) {
    const d = dayOf(off), k = key(d);
    const hit = cache.get(k), live = hit && hit.list.some(m => m.state === 'live');
    const ttl = live ? 55e3 : off === 0 ? 15 * 60e3 : 30 * 60e3;
    if (hit && !force && Date.now() - hit.at < ttl) return hit.list;
    const list = [];
    const order = [...COMPS.filter(c => !c.team), ...COMPS.filter(c => c.team)]; // scoreboards first: they carry the live score
    for (const c of order) {            // one after another: never a burst of requests on the TV
      if (!on(c)) continue;
      try {
        const evs = c.team ? await team(c) : ((await get(`${API}${c.code}/scoreboard?dates=${k}`)).events || []).map(e => slim(e, c));
        for (const m of evs) if (m && key(new Date(m.start)) === k && !list.some(x => x.id === m.id)) list.push(m);
      } catch (e) { /* this competition is unavailable right now: show the others */ }
    }
    // favorites (Morocco, Real Madrid) first, then live, upcoming by time, finished
    const st = { live: 0, pre: 1, post: 2, off: 3 };
    list.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || st[a.state] - st[b.state] || a.start - b.start || RANK[a.comp] - RANK[b.comp]);
    cache.set(k, { at: Date.now(), list });
    if (cache.size > 10) cache.delete(cache.keys().next().value);
    return list;
  }

  const label = off => off === 0 ? 'Today' : off === 1 ? 'Tomorrow' : off === -1 ? 'Yesterday'
    : dayOf(off).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  /* ---------- home card feed: today's games only ---------- */
  let timer = 0, busy = false, current = TV.store.get('matches', null);
  async function refresh(force) {
    clearTimeout(timer);
    if (TV.settings.matches === false) { emit({ off: 0, list: [], card: [] }); return; }
    if (busy) return; busy = true;
    try {
      const off = 0, list = await load(0, force); // today only: no games today, no card
      emit({ off, list, card: list, day: key(dayOf(0)) }); // favorites (only when they play that day) are already first
    } finally { busy = false; }
    schedule();
  }
  function schedule() {
    const live = current && current.list.some(m => m.state === 'live');
    const soon = current && current.list.some(m => m.state === 'pre' && m.start - Date.now() < 3 * 60e3);
    timer = setTimeout(refresh, live || soon ? 60e3 : 15 * 60e3);
  }
  function emit(feed) {
    current = feed;
    TV.store.set('matches', feed);
    document.dispatchEvent(new CustomEvent('tv:matches', { detail: feed }));
  }
  // back on screen: refresh if the data is old (nothing runs while another app is open)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

  TV.matches = {
    COMPS, load, label, refresh,
    // the saved feed from last time, but only if it is still today's
    get feed() { return current && current.day === key(dayOf(0)) ? current : null; },
    start() { setTimeout(refresh, 2500); }, // after the home screen has settled
    comp: id => COMPS[RANK[id]],
  };
})();
