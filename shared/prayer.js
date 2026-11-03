/* Prayer time engine — runs fully offline (PrayTimes.org algorithm).
   Usage: TV.prayer.getTimes(lat, lng, date, methodKey, asrFactor) -> { fajr, sunrise, dhuhr, asr, maghrib, isha } as Date */
window.TV = window.TV || {};

(function () {
  const METHODS = {
    morocco:  { name: 'Morocco (Habous)',            fajr: 19,   isha: 17,   adj: { dhuhr: 5, maghrib: 5 } },
    mwl:      { name: 'Muslim World League',         fajr: 18,   isha: 17,   adj: { dhuhr: 1 } },
    ummalqura:{ name: 'Umm al-Qura (Makkah)',        fajr: 18.5, ishaMin: 90, adj: {} },
    egyptian: { name: 'Egyptian Authority',          fajr: 19.5, isha: 17.5, adj: { dhuhr: 1 } },
    dubai:    { name: 'Dubai / Gulf',                fajr: 18.2, isha: 18.2, adj: { sunrise: -3, dhuhr: 3, asr: 3, maghrib: 3 } },
    karachi:  { name: 'Karachi',                     fajr: 18,   isha: 18,   adj: { dhuhr: 1 } },
    isna:     { name: 'North America (ISNA)',        fajr: 15,   isha: 15,   adj: { dhuhr: 1 } },
    algeria:  { name: 'Algeria',                     fajr: 18,   isha: 17,   adj: { maghrib: 3 } },
    tunisia:  { name: 'Tunisia',                     fajr: 18,   isha: 18,   adj: {} },
    turkey:   { name: 'Turkey (Diyanet)',            fajr: 18,   isha: 17,   adj: { sunrise: -7, dhuhr: 5, asr: 4, maghrib: 7 } },
    france:   { name: 'France (UOIF 12°)',           fajr: 12,   isha: 12,   adj: {} },
  };

  const COUNTRY_METHOD = {
    MA: 'morocco', SA: 'ummalqura', AE: 'dubai', QA: 'dubai', KW: 'dubai', BH: 'dubai', OM: 'dubai',
    EG: 'egyptian', LY: 'egyptian', SD: 'egyptian', SY: 'egyptian', LB: 'egyptian', JO: 'egyptian', IQ: 'egyptian',
    PK: 'karachi', IN: 'karachi', BD: 'karachi', AF: 'karachi',
    US: 'isna', CA: 'isna', DZ: 'algeria', TN: 'tunisia', TR: 'turkey', FR: 'france',
  };

  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const sin = d => Math.sin(rad(d)), cos = d => Math.cos(rad(d)), tan = d => Math.tan(rad(d));
  const asin = x => deg(Math.asin(x)), acos = x => deg(Math.acos(x)), atan2 = (y, x) => deg(Math.atan2(y, x));
  const acot = x => deg(Math.atan(1 / x));
  const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };

  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }

  function sunPosition(jd) {
    const D = jd - 2451545.0;
    const g = fix(357.529 + 0.98560028 * D, 360);
    const q = fix(280.459 + 0.98564736 * D, 360);
    const L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
    const e = 23.439 - 0.00000036 * D;
    const RA = atan2(cos(e) * sin(L), cos(L)) / 15;
    return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - fix(RA, 24) };
  }

  function getTimes(lat, lng, date, methodKey = 'mwl', asrFactor = 1) {
    const m = METHODS[methodKey] || METHODS.mwl;
    const y = date.getFullYear(), mo = date.getMonth() + 1, d = date.getDate();
    const jDate = julian(y, mo, d) - lng / (15 * 24);
    const tz = -new Date(y, mo - 1, d, 12).getTimezoneOffset() / 60;

    const midDay = t => fix(12 - sunPosition(jDate + t).eqt, 24);
    const angleTime = (angle, t, ccw) => {
      const decl = sunPosition(jDate + t).decl, noon = midDay(t);
      const tt = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
      return noon + (ccw ? -tt : tt);
    };
    const asrTime = t => {
      const decl = sunPosition(jDate + t).decl;
      return angleTime(-acot(asrFactor + tan(Math.abs(lat - decl))), t);
    };

    // two refinement passes, starting from rough guesses (hours)
    let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, isha: 18 };
    for (let i = 0; i < 2; i++) {
      const p = k => t[k] / 24;
      t = {
        fajr: angleTime(m.fajr, p('fajr'), true),
        sunrise: angleTime(0.833, p('sunrise'), true),
        dhuhr: midDay(p('dhuhr')),
        asr: asrTime(p('asr')),
        sunset: angleTime(0.833, p('sunset')),
        isha: m.ishaMin ? t.sunset : angleTime(m.isha, p('isha')),
      };
    }
    if (m.ishaMin) t.isha = t.sunset + m.ishaMin / 60;

    // high-latitude safety: night-fraction fallback
    const night = 24 - (t.sunset - t.sunrise);
    if (isNaN(t.fajr)) t.fajr = t.sunrise - night * (m.fajr / 60);
    if (isNaN(t.isha)) t.isha = t.sunset + night * ((m.isha || 17) / 60);

    const out = {};
    const keys = { fajr: 'fajr', sunrise: 'sunrise', dhuhr: 'dhuhr', asr: 'asr', maghrib: 'sunset', isha: 'isha' };
    for (const [name, src] of Object.entries(keys)) {
      const hours = t[src] + tz - lng / 15 + ((m.adj[name] || 0) / 60);
      const ms = Math.round(hours * 60) * 60000; // round to minute
      out[name] = new Date(new Date(y, mo - 1, d).getTime() + ms);
    }
    return out;
  }

  TV.prayer = {
    METHODS, COUNTRY_METHOD, getTimes,
    ORDER: ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'],
    SALAH: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'],
    NAMES: { fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' },
    AR: { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' },
    methodFor: cc => COUNTRY_METHOD[(cc || '').toUpperCase()] || 'mwl',
  };
})();
