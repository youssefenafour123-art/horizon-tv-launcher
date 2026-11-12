/* Formula 1 on race weekends: session times (FP1–3, Sprint, Qualifying, Race) and podiums, from ESPN's public
   F1 scoreboard. Outside a race weekend it does nothing but check the season calendar once a day.
   During a weekend it refreshes every 15 min, or every minute while a session is live. */
window.TV = window.TV || {};

(function () {
  const API = 'https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard';
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const get = url => fetch(url, { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject(r.status));
  const enabled = () => (TV.settings.matchComps || {}).f1 !== false && TV.settings.matches !== false;

  // 3-letter driver codes as on the timing screens (NOR, VER, ANT…)
  const code = a => {
    const last = String((a && (a.lastName || a.shortName || a.displayName)) || '').split(/[\s.]+/).filter(Boolean).pop() || '';
    return last.normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3).toUpperCase();
  };
  const SPONSOR = /^(MSC Cruises|Heineken|Qatar Airways|Etihad Airways|Aramco|Pirelli|Lenovo|AWS|Crypto\.com|Louis Vuitton|Gulf Air|STC|Rolex|Mo[eë]t & Chandon|TAG Heuer|Singapore Airlines|Santander|Emirates|Airwallex|Allwyn|Formula 1)\s+/i;
  const NAMES = { FP1: 'Practice 1', FP2: 'Practice 2', FP3: 'Practice 3', Qual: 'Qualifying', SS: 'Sprint Quali', Sprint: 'Sprint', SR: 'Sprint', Race: 'Race' };
  const SHORT = { FP1: 'FP1', FP2: 'FP2', FP3: 'FP3', Qual: 'QUALI', SS: 'SQ', Sprint: 'SPRINT', SR: 'SPRINT', Race: 'RACE' };

  function slim(e) {
    const sessions = (e.competitions || []).map(c => {
      const t = (c.type && c.type.abbreviation) || '', st = (c.status && c.status.type) || {};
      const order = (c.competitors || []).slice().sort((a, b) => (a.order || 99) - (b.order || 99));
      return {
        id: t, label: SHORT[t] || t.toUpperCase(), name: NAMES[t] || t, start: Date.parse(c.date),
        state: st.state === 'in' ? 'live' : st.state === 'post' ? 'post' : 'pre',
        lap: st.state === 'in' && c.status.period ? c.status.period : 0,
        top: order.slice(0, 3).map(x => code(x.athlete)),
      };
    }).sort((a, b) => a.start - b.start);
    const where = (e.circuit && e.circuit.address) || {};
    // drop the title sponsor: "MSC Cruises São Paulo Grand Prix" → "São Paulo Grand Prix"
    const name = String(e.name || '').replace(SPONSOR, '').trim();
    return { id: e.id, name,
      circuit: (e.circuit && e.circuit.fullName) || '', place: [where.city, where.country].filter(Boolean).join(', '), sessions };
  }

  let cal = TV.store.get('f1cal', null), weekend = null, timer = 0;
  // the current race weekend: from a day before the first session until 12 h after the race
  const current = (now = Date.now()) => (cal && cal.list || []).find(w => now >= Date.parse(w.startDate) - 864e5 && now <= Date.parse(w.endDate) + 12 * 3600e3);

  async function refresh() {
    clearTimeout(timer);
    if (!enabled()) { emit(null); return; }
    try {
      if (!cal || Date.now() - cal.at > 864e5) {
        const d = await get(API);
        const list = (((d.leagues || [])[0] || {}).calendar || []).map(w => ({ label: w.label, startDate: w.startDate, endDate: w.endDate }));
        if (list.length) { cal = { at: Date.now(), list }; TV.store.set('f1cal', cal); }
      }
      const w = preview || current();
      if (w) {
        const d = await get(`${API}?dates=${ymd(new Date(Date.parse(w.startDate) + 6 * 3600e3))}`);
        const e = (d.events || [])[0];
        emit(e ? slim(e) : null);
      } else emit(null);
    } catch (e) { /* offline: keep what we have */ }
    const live = weekend && weekend.sessions.some(s => s.state === 'live' || (s.state === 'pre' && s.start - Date.now() < 10 * 60e3));
    const next = cal && cal.list.map(w => Date.parse(w.startDate) - 864e5).find(t => t > Date.now());
    timer = setTimeout(refresh, weekend ? (live ? 60e3 : 15 * 60e3) : Math.min(6 * 3600e3, next ? Math.max(60e3, next - Date.now()) : 6 * 3600e3));
  }
  function emit(w) {
    weekend = w;
    document.dispatchEvent(new CustomEvent('tv:f1', { detail: w }));
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && weekend) refresh(); });

  let preview = null;
  // F key (debug): show the most recent race weekend, press again to go back
  document.addEventListener('keydown', e => {
    if (e.key !== 'f' && e.key !== 'F') return;
    if (preview) return TV.f1.preview();
    const past = (cal && cal.list || []).filter(w => Date.parse(w.startDate) < Date.now()).pop();
    if (past) TV.f1.preview(past.startDate);
  });
  TV.f1 = {
    get weekend() { return weekend; },
    get live() { return !!(weekend && weekend.sessions.some(s => s.state === 'live')); },
    refresh,
    start() { setTimeout(refresh, 4000); },
    // try the tab outside a race weekend: TV.f1.preview('2026-11-06') shows that weekend; TV.f1.preview() goes back
    preview(date) { preview = date ? { startDate: new Date(Date.parse(date) + 3600e3).toISOString(), endDate: new Date(date).toISOString() } : null; refresh(); },
  };
})();
