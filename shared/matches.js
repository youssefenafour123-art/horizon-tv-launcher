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
    { id: 'bot',  tag: 'BP',   name: 'Botola Pro', sdb: 4520 }, // not on ESPN: TheSportsDB (free test key)
    { id: 'ucl',  tag: 'UCL',  name: 'Champions League', code: 'uefa.champions' },
    { id: 'uel',  tag: 'UEL',  name: 'Europa League', code: 'uefa.europa' },
    { id: 'uecl', tag: 'UECL', name: 'Conference League', code: 'uefa.europa.conf' },
    { id: 'pl',   tag: 'PL',   name: 'Premier League', code: 'eng.1' },
    { id: 'll',   tag: 'LL',   name: 'LaLiga', code: 'esp.1' },
    { id: 'sa',   tag: 'SA',   name: 'Serie A', code: 'ita.1' },
    { id: 'l1',   tag: 'L1',   name: 'Ligue 1', code: 'fra.1' },
    // national teams (one switch in Settings: "National teams")
    { id: 'wc',   tag: 'WC',   name: 'World Cup', code: 'fifa.world', nt: true },
    { id: 'euro', tag: 'EURO', name: 'EURO', code: 'uefa.euro', nt: true },
    { id: 'unl',  tag: 'UNL',  name: 'Nations League', code: 'uefa.nations', nt: true },
    { id: 'afcon', tag: 'AFCON', name: 'Africa Cup of Nations', code: 'caf.nations', nt: true },
    { id: 'ca',   tag: 'CA',   name: 'Copa América', code: 'conmebol.america', nt: true },
    { id: 'wcqe', tag: 'WCQ',  name: 'World Cup qualifiers · Europe', code: 'fifa.worldq.uefa', nt: true },
    { id: 'wcqa', tag: 'WCQ',  name: 'World Cup qualifiers · Africa', code: 'fifa.worldq.caf', nt: true },
    { id: 'wcqs', tag: 'WCQ',  name: 'World Cup qualifiers · South America', code: 'fifa.worldq.conmebol', nt: true },
    { id: 'euq',  tag: 'EUQ',  name: 'EURO qualifiers', code: 'uefa.euroq', nt: true },
    { id: 'afq',  tag: 'AFQ',  name: 'AFCON qualifiers', code: 'caf.nations_qual', nt: true },
    { id: 'fri',  tag: 'FRI',  name: 'International friendlies', code: 'fifa.friendly', nt: true },
  ];
  const RANK = Object.fromEntries(COMPS.map((c, i) => [c.id, i]));
  const FAV_TEAMS = COMPS.filter(c => c.fav);
  // a team schedule lists every competition: file each game under its own (Real Madrid in LaLiga stays in LaLiga)
  const LEAGUE = n => /conference/i.test(n) ? 'uecl' : /europa/i.test(n) ? 'uel' : /champions/i.test(n) ? 'ucl' : /laliga|la liga/i.test(n) ? 'll' : null;
  const on = c => TV.settings.matches !== false && (TV.settings.matchComps || {})[c.nt ? 'nt' : c.id] !== false;

  /* ---------- who matters most: the biggest clubs and national teams go first on the card ----------
     2 = elite, 1 = strong. Matched on the team's full name, so the same 3-letter code in two leagues never mixes up. */
  const ELITE = /^(real madrid|barcelona|bayern( munich| m[üu]nchen)?|fc bayern m[üu]nchen|manchester city|liverpool|arsenal|paris saint-germain|psg|internazionale|inter milan|chelsea|juventus|ac milan|manchester united|atl[ée]tico( de)? madrid|borussia dortmund|bayer leverkusen|napoli|argentina|france|spain|england|brazil|portugal|netherlands|belgium|germany|italy|croatia|morocco|uruguay)$/i;
  const STRONG = /^(tottenham( hotspur)?|newcastle( united)?|aston villa|as roma|roma|atalanta|lazio|marseille|olympique de marseille|monaco|as monaco|lille|lyon|olympique lyonnais|benfica|fc porto|porto|sporting( cp)?|ajax|psv( eindhoven)?|galatasaray|fenerbah[çc]e|real sociedad|athletic club|villarreal|real betis|sevilla|rb leipzig|wydad( casablanca)?|raja( casablanca)?|as far|far rabat|rs berkane|renaissance berkane|colombia|united states|usa|mexico|switzerland|denmark|japan|senegal|nigeria|egypt|algeria|tunisia|ivory coast|c[ôo]te d'ivoire|turkey|t[üu]rkiye|austria|norway|ecuador|south korea|korea republic|ukraine|poland|sweden|serbia|cameroon|ghana|scotland)$/i;
  const weight = n => ELITE.test(n.trim()) ? 2 : STRONG.test(n.trim()) ? 1 : 0;
  const BIG_COMP = { ucl: 1, wc: 1, euro: 1, afcon: 1, ca: 1 }; // the big stages lift any game a little
  function prio(m) {
    const a = weight(m.h.n || ''), b = weight(m.a.n || '');
    return a + b + (a && b ? 1 : 0) + (BIG_COMP[m.comp] || 0); // two big teams meeting: a little extra
  }
  const withPrio = m => (m.prio = prio(m), m);

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
    const side = x => ({ id: String(x.team.id), n: x.team.displayName || x.team.name || '', code: x.team.abbreviation || (x.team.shortDisplayName || '').slice(0, 3).toUpperCase(),
      logo: crest(x.team.logo || (x.team.logos && x.team.logos[0] && x.team.logos[0].href)), s: score(x.score) });
    let state = type.state === 'in' ? 'live' : type.state === 'post' ? 'post' : 'pre', min = '';
    if (state === 'live') min = /HALFTIME/.test(type.name || '') ? 'HT' : /END_OF_REGULATION|END_OF_EXTRATIME/.test(type.name || '') ? 'BRK'
      : /SHOOTOUT|PENALT/.test(type.name || '') ? 'PENS' : (status.displayClock || '');
    if (/POSTPONED|CANCELED|SUSPENDED/.test(type.name || '')) { state = 'off'; min = 'PPD'; }
    let cid = comp.id;
    if (comp.id === 'rma') { const lg = e.league || (e.competitions[0].league) || {}; cid = LEAGUE(lg.abbreviation || lg.name || '') || 'rma'; }
    const m = { id: e.id, comp: cid, start: Date.parse(e.date), state, min, at: Date.now(), period: status.period || 0, h: side(h), a: side(a) };
    m.fav = comp.fav || FAV_TEAMS.some(f => m.h.id === String(f.team) || m.a.id === String(f.team));
    m.prio = prio(m);
    return m;
  }

  /* ---------- Botola Pro (TheSportsDB): short codes as Moroccan fans write them ---------- */
  const SDB = 'https://www.thesportsdb.com/api/v1/json/123/';
  const BOTOLA = [
    [/wydad casa|^wac|wydad ac/i, 'WAC'], [/raja/i, 'RCA'], [/fus|fath union/i, 'FUS'], [/far\b|forces arm/i, 'FAR'],
    [/berkane/i, 'RSB'], [/maghreb.*f[eè]s|mas\b/i, 'MAS'], [/kawkab/i, 'KACM'], [/hassania|agadir/i, 'HUSA'],
    [/tanger|ittihad riadi/i, 'IRT'], [/safi/i, 'OCS'], [/jadid/i, 'DHJ'], [/mekn[eè]s|codm/i, 'CODM'],
    [/t[ée]touan/i, 'MAT'], [/touarga/i, 'UTS'], [/zemamra/i, 'RCAZ'], [/temara/i, 'WST'], [/tiznit/i, 'AT'],
    [/mohammedia|chabab moh/i, 'SCCM'], [/soualem/i, 'JSS'], [/oujda|mouloudia/i, 'MCO'], [/khouribga/i, 'OCK'],
    [/nador|hilal/i, 'CAYB'], [/dcheira/i, 'OD'],
  ];
  const short = n => (BOTOLA.find(([r]) => r.test(n)) || [, (n.replace(/^(FC|CA|AS|RC|SC|US|CS)\s+/i, '').match(/[A-Za-zÀ-ÿ]+/) || [''])[0].slice(0, 3).toUpperCase()])[1];
  function slimSdb(e, comp) {
    const st = e.strStatus || 'NS';
    let state = /^(FT|AET|PEN|AP)$/.test(st) ? 'post' : /^(1H|2H|HT|ET|BT|P|LIVE|INT)$/.test(st) ? 'live' : /PST|CANC|ABD|SUSP/.test(st) ? 'off' : 'pre';
    const min = state === 'live' ? (st === 'HT' ? 'HT' : e.strProgress ? String(e.strProgress).replace(/'+$/, '') + "'" : '') : state === 'off' ? 'PPD' : '';
    const side = (name, id, badge, sc) => ({ id: 'sdb' + id, n: name || '', code: short(name || ''), logo: badge ? badge + '/tiny' : '', s: sc == null ? '' : String(sc) });
    const ts = e.strTimestamp ? Date.parse(e.strTimestamp.replace(/(\+00:00)?$/, 'Z')) : Date.parse(`${e.dateEvent}T${e.strTime || '00:00:00'}Z`);
    return withPrio({ id: 'sdb' + e.idEvent, comp: comp.id, start: ts, state, min, at: Date.now(), half: st, fav: false,
      h: side(e.strHomeTeam, e.idHomeTeam, e.strHomeTeamBadge, e.intHomeScore), a: side(e.strAwayTeam, e.idAwayTeam, e.strAwayTeamBadge, e.intAwayScore) });
  }
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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
  // each competition has its own clock: live or about to start → 1 min; games that day → 15 min (30 for other days);
  // nothing that day → 3 h. So 20 competitions cost about as much as a handful, and an empty day costs almost nothing.
  const compCache = new Map(); // `${comp}|${day}` → { at, list }
  const ttlOf = (list, off) => {
    const now = Date.now();
    if (list.some(m => m.state === 'live' || (m.state === 'pre' && m.start - now < 10 * 60e3 && m.start - now > -3 * 3600e3))) return 55e3;
    return list.length ? (off === 0 ? 15 * 60e3 : 30 * 60e3) : 3 * 3600e3;
  };
  async function compDay(c, d, k, off, force) {
    const ck = c.id + '|' + k, hit = compCache.get(ck);
    if (hit && !force && Date.now() - hit.at < ttlOf(hit.list, off)) return hit.list;
    const list = c.sdb ? ((await get(`${SDB}eventsday.php?d=${iso(d)}&l=${c.sdb}`)).events || []).map(e => slimSdb(e, c))
      : ((await get(`${API}${c.code}/scoreboard?dates=${k}`)).events || []).map(e => slim(e, c));
    compCache.set(ck, { at: Date.now(), list });
    if (compCache.size > 160) compCache.delete(compCache.keys().next().value);
    return list;
  }

  async function load(off, force) {
    const d = dayOf(off), k = key(d);
    const hit = cache.get(k);
    if (hit && !force && Date.now() - hit.at < 20e3) return hit.list; // the panel and the card asking at the same moment
    const list = [];
    const order = [...COMPS.filter(c => !c.team), ...COMPS.filter(c => c.team)]; // scoreboards first: they carry the live score
    for (const c of order) {            // one after another: never a burst of requests on the TV
      if (!on(c)) continue;
      try {
        const evs = c.team ? await team(c) : await compDay(c, d, k, off, force);
        for (const m of evs) if (m && key(new Date(m.start)) === k && !list.some(x => x.id === m.id)) list.push(m);
      } catch (e) { /* this competition is unavailable right now: show the others */ }
    }
    // favorites (Morocco, Real Madrid) first, then the biggest teams, then live, upcoming by time, finished
    const st = { live: 0, pre: 1, post: 2, off: 3 };
    list.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || (b.prio || 0) - (a.prio || 0) || st[a.state] - st[b.state] || a.start - b.start || RANK[a.comp] - RANK[b.comp]);
    cache.set(k, { at: Date.now(), list });
    if (cache.size > 10) cache.delete(cache.keys().next().value);
    return list;
  }

  /* ---------- the exact minute of a live game, counted on between data refreshes ----------
     Reads "52'" or "45'+2'" from the last refresh and adds the minutes since; at the end of a half it moves into
     stoppage time (45'+1', 90'+3'…) instead of running past 45 / 90. Botola often gives only the half: then the
     minute comes from the kick-off time (15 min half-time break). */
  const ENDS = [45, 90, 105, 120];
  function minute(m) {
    if (m.state !== 'live') return '';
    if (m.min === 'HT' || m.min === 'BRK' || m.min === 'PENS') return m.min === 'BRK' ? 'Break' : m.min === 'PENS' ? 'Pens' : 'HT';
    const since = Math.max(0, Math.floor((Date.now() - (m.at || Date.now())) / 60000));
    let base = 0, extra = -1, end = 0;
    const mm = String(m.min || '').match(/^(\d+)'?(?:\s*\+\s*(\d+))?/);
    if (mm) { base = +mm[1]; if (mm[2] != null) extra = +mm[2]; }
    else if (m.half) {                                   // only "1H" / "2H": estimate from the kick-off
      const run = Math.floor((Date.now() - m.start) / 60000) + 1;
      base = m.half === '2H' ? Math.max(46, run - 15) : m.half === 'ET' ? Math.max(91, run - 20) : Math.max(1, run);
      return fmtMin(base, m.half === '2H' ? 90 : m.half === 'ET' ? 120 : 45);
    } else return 'Live';
    if (extra >= 0) return `${base}'+${extra + since}'`;        // already in stoppage time
    end = ENDS.find(x => x >= base) || 120;
    if (m.period) end = ENDS[Math.min(ENDS.length, m.period) - 1] || end;
    return fmtMin(base + since, end);
  }
  const fmtMin = (n, end) => n > end ? `${end}'+${n - end}'` : `${n}'`;

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
    COMPS, load, label, refresh, minute,
    // the saved feed from last time, but only if it is still today's
    get feed() { return current && current.day === key(dayOf(0)) ? current : null; },
    start() { setTimeout(refresh, 2500); }, // after the home screen has settled
    comp: id => COMPS[RANK[id]],
  };
})();
