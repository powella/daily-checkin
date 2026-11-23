(function (global) {
  'use strict';

  // Streak tiers. A longer streak unlocks a bigger points multiplier.
  var TIERS = [
    { min: 1, mult: 1 },
    { min: 3, mult: 1.5 },
    { min: 7, mult: 2 },
    { min: 14, mult: 2.5 },
    { min: 30, mult: 3 }
  ];

  var RANKS = [
    { min: 150, name: 'Local legend' },
    { min: 75, name: 'Standout' },
    { min: 30, name: 'Familiar face' },
    { min: 10, name: 'Regular' },
    { min: 0, name: 'Newcomer' }
  ];

  // ---------- Beacons ----------
  //
  // A beacon is a moniker you hold on to: every check-in adds one point to it.
  // People on the same beacon are a circle, and their points pool under it.
  // Here that is your own contribution; a shared board adds everyone else's.

  var BEACON_MIN = 2;
  var BEACON_MAX = 24;

  var RESERVED_BEACONS = [
    'admin', 'administrator', 'support', 'mod', 'moderator', 'staff', 'official',
    'system', 'root', 'daily', 'leaderboard', 'leader board', 'me', 'you', 'none',
    'null', 'anonymous', 'everyone', 'anyone', 'deleted', 'app'
  ];

  // Folded spellings only: input is lowercased, accents stripped and 0/1/3-style
  // digits swapped back to letters before matching.
  var BANNED_BEACON_TOKENS = [
    'arse', 'arsehole', 'ass', 'asshole', 'asshat', 'bastard', 'bitch', 'bitches',
    'blowjob', 'bollocks', 'boner', 'boob', 'boobs', 'bugger', 'cock', 'cockhead',
    'crap', 'cum', 'cunt', 'cunts', 'dick', 'dickhead', 'dicks', 'dildo', 'douche',
    'douchebag', 'dyke', 'fag', 'faggot', 'faggots', 'fags', 'fuck', 'fucked',
    'fucker', 'fuckers', 'fucking', 'gook', 'handjob', 'horny', 'jackass', 'jerkoff',
    'kike', 'kkk', 'knob', 'knobhead', 'nazi', 'nazis', 'negro', 'nigga', 'niggas',
    'nigger', 'niggers', 'nutsack', 'orgy', 'paedo', 'paedophile', 'pedo',
    'pedophile', 'penis', 'piss', 'porn', 'porno', 'prick', 'pube', 'pubes', 'pussy',
    'queer', 'rape', 'raped', 'rapist', 'retard', 'retarded', 'scrotum', 'semen',
    'sex', 'sexy', 'shag', 'shit', 'shite', 'shits', 'shitty', 'skank', 'slut',
    'sluts', 'spic', 'spick', 'tits', 'titty', 'tosser', 'tranny', 'twat', 'vagina',
    'wank', 'wanker', 'whore', 'whores', 'wog', 'wop'
  ];

  // Longer offending words hide inside other words ("fucker", "shitty"),
  // so these are matched as substrings unless the whole word is allowlisted.
  var BANNED_BEACON_STEMS = [
    'asshole', 'bitch', 'blowjob', 'cunt', 'dickhead', 'faggot', 'fuck', 'handjob',
    'hitler', 'jackoff', 'motherfuck', 'nazi', 'nigg', 'paedophil', 'pedophil',
    'porn', 'rapist', 'retard', 'shit', 'tranny', 'whore'
  ];

  // Innocent words that contain a banned stem.
  var SAFE_BEACON_TOKENS = [
    'analog', 'analogue', 'analysis', 'analyst', 'assassin', 'assassins', 'assess',
    'assessment', 'assume', 'assumption', 'bass', 'bassoon', 'brass', 'class',
    'classes', 'classic', 'classy', 'cockatoo', 'cocktail', 'constitution', 'crass',
    'cucumber', 'dickens', 'dickinson', 'document', 'documentation', 'essex', 'glass',
    'grape', 'grapefruit', 'grapes', 'grass', 'hancock', 'hello', 'hitchcock', 'mass',
    'masses', 'middlesex', 'pass', 'passed', 'passenger', 'peacock', 'penal',
    'penalty', 'peninsula', 'punctuation', 'sassy', 'scunthorpe', 'shell', 'shelter',
    'shitake', 'shiitake', 'sussex', 'therapist', 'therapy', 'titan', 'titrate'
  ];

  // Look-alike letters from other alphabets, mapped so the filters above still see
  // the word someone actually typed.
  var HOMOGLYPHS = {
    '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p', '\u0441': 'c',
    '\u0445': 'x', '\u0443': 'y', '\u0456': 'i', '\u0458': 'j', '\u043A': 'k',
    '\u043C': 'm', '\u0442': 't', '\u043D': 'h', '\u0432': 'b', '\u0455': 's',
    '\u0501': 'd', '\u0261': 'g', '\u03BF': 'o', '\u03B1': 'a', '\u03B9': 'i',
    '\u03BA': 'k', '\u03BD': 'v', '\u03C4': 't', '\u03C1': 'p', '\u03C5': 'u',
    '\u03C7': 'x'
  };

  var LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g' };

  function isDayKey(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function earliest(a, b) {
    if (!isDayKey(a)) return isDayKey(b) ? b : null;
    if (!isDayKey(b)) return a;
    return a <= b ? a : b;
  }

  function latest(a, b) {
    if (!isDayKey(a)) return isDayKey(b) ? b : null;
    if (!isDayKey(b)) return a;
    return a >= b ? a : b;
  }

  // Case, width, accents and look-alikes flattened away. Not yet leet-folded.
  function foldBase(text) {
    var value = String(text == null ? '' : text);
    if (value.normalize) {
      value = value.normalize('NFKC').toLowerCase();
      value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } else {
      value = value.toLowerCase();
    }

    var out = '';
    for (var i = 0; i < value.length; i++) {
      var ch = value.charAt(i);
      out += HOMOGLYPHS[ch] || ch;
    }
    return out;
  }

  // The identity of a beacon: "Captain  Kirk" and "captain kirk" are one beacon.
  function beaconKey(name) {
    return foldBase(name).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function leet(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      out += LEET[ch] || ch;
    }
    return out;
  }

  function blockedWord(token) {
    if (!token) return false;
    if (SAFE_BEACON_TOKENS.indexOf(token) !== -1) return false;
    if (BANNED_BEACON_TOKENS.indexOf(token) !== -1) return true;
    for (var s = 0; s < BANNED_BEACON_STEMS.length; s++) {
      if (token.indexOf(BANNED_BEACON_STEMS[s]) !== -1) return true;
    }
    return false;
  }

  function isReservedBeacon(key) {
    var forms = [key, leet(key), leet(key.replace(/ /g, ''))];
    for (var i = 0; i < forms.length; i++) {
      if (RESERVED_BEACONS.indexOf(forms[i]) !== -1) return true;
    }
    return false;
  }

  function isBlockedBeacon(key) {
    var tokens = key.split(' ');
    for (var i = 0; i < tokens.length; i++) {
      if (blockedWord(leet(tokens[i]))) return true;
    }
    // Letters spaced out one by one only read as a word once the gaps go.
    return blockedWord(leet(key.replace(/ /g, '')));
  }

  // Returns { ok: true, name, key } or { ok: false, error }.
  function checkBeacon(input) {
    var name = String(input == null ? '' : input).replace(/\s+/g, ' ').trim();

    if (!name) return { ok: false, error: 'Give your beacon a name.' };
    if (name.length < BEACON_MIN) {
      return { ok: false, error: 'Use at least ' + BEACON_MIN + ' characters.' };
    }
    if (name.length > BEACON_MAX) {
      return { ok: false, error: 'Keep it to ' + BEACON_MAX + ' characters or fewer.' };
    }
    if (!/^[A-Za-z\u00C0-\u024F0-9 '.-]+$/.test(name)) {
      return { ok: false, error: "Letters, numbers, spaces, apostrophes, hyphens and full stops only." };
    }
    if (/^[ '.-]|[ '.-]$/.test(name)) {
      return { ok: false, error: 'Start and end with a letter or number.' };
    }
    if (!/[A-Za-z\u00C0-\u024F0-9]/.test(name)) {
      return { ok: false, error: 'Include at least one letter.' };
    }

    var key = beaconKey(name);
    if (!key) return { ok: false, error: 'Give your beacon a name.' };
    if (isReservedBeacon(key)) {
      return { ok: false, error: 'That name is reserved. Pick another.' };
    }
    if (isBlockedBeacon(key)) {
      return { ok: false, error: 'That name is not allowed. Pick another.' };
    }

    return { ok: true, name: name, key: key };
  }

  // The key the shared board knows this player by: random, kept on the device and
  // carried inside a sync code. Only its hash is stored server-side.
  function cleanToken(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null;
  }

  // A board name, kept short like a beacon.
  function cleanHandle(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, BEACON_MAX);
  }

  // Tolerant read of a stored or imported beacon: shape only, no re-screening,
  // so a name that later lands on a blocklist does not silently vanish.
  function cleanBeacon(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var name = typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim() : '';
    var key = typeof raw.key === 'string' ? beaconKey(raw.key) : '';
    if (!key && name) key = beaconKey(name);
    if (!key) return null;
    if (name.length > BEACON_MAX) name = name.slice(0, BEACON_MAX);
    return {
      name: name || key,
      key: key,
      since: isDayKey(raw.since) ? raw.since : null
    };
  }

  function cleanBuckets(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;

    for (var key in raw) {
      if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
      var bucket = raw[key];
      if (!bucket || typeof bucket !== 'object') continue;
      var id = beaconKey(key);
      if (!id) continue;
      out[id] = {
        name: typeof bucket.name === 'string' && bucket.name.trim() ? bucket.name.trim() : key,
        points: Math.max(0, Math.round(Number(bucket.points) || 0)),
        since: isDayKey(bucket.since) ? bucket.since : null,
        lastDay: isDayKey(bucket.lastDay) ? bucket.lastDay : null
      };
    }
    return out;
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function dayKey(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function dayFromKey(key) {
    var parts = key.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  // Whole days from a stored day key to `date`, safe across daylight saving shifts.
  function daysBetween(fromKey, date) {
    var from = dayFromKey(fromKey);
    var a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    var b = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((b - a) / 86400000);
  }

  function multiplierFor(streak) {
    var best = 1;
    for (var i = 0; i < TIERS.length; i++) {
      if (streak >= TIERS[i].min) best = TIERS[i].mult;
    }
    return best;
  }

  function nextTier(streak) {
    for (var i = 0; i < TIERS.length; i++) {
      if (TIERS[i].min > streak) return TIERS[i];
    }
    return null;
  }

  function currentTier(streak) {
    var found = TIERS[0];
    for (var i = 0; i < TIERS.length; i++) {
      if (streak >= TIERS[i].min) found = TIERS[i];
    }
    return found;
  }

  function rankFor(score) {
    for (var i = 0; i < RANKS.length; i++) {
      if (score >= RANKS[i].min) return RANKS[i].name;
    }
    return RANKS[RANKS.length - 1].name;
  }

  function emptyState() {
    return {
      score: 0,
      streak: 0,
      lastDay: null,
      // Lifetime presses of the check-in button. Never spent, never reset.
      clicks: 0,
      days: {},
      beacon: null,
      beacons: {},
      token: null,
      handle: '',
      // What the server has confirmed. Anything different is sent on the next sync.
      serverBeacon: '',
      serverHandle: ''
    };
  }

  function cloneState(state) {
    var next = {
      score: state.score,
      streak: state.streak,
      lastDay: state.lastDay,
      clicks: Math.max(0, Math.floor(Number(state.clicks) || 0)),
      days: {},
      beacon: state.beacon
        ? { name: state.beacon.name, key: state.beacon.key, since: state.beacon.since }
        : null,
      beacons: {},
      token: cleanToken(state.token),
      handle: cleanHandle(state.handle),
      serverBeacon: typeof state.serverBeacon === 'string' ? state.serverBeacon : '',
      serverHandle: typeof state.serverHandle === 'string' ? state.serverHandle : ''
    };

    for (var key in state.days) {
      if (Object.prototype.hasOwnProperty.call(state.days, key)) {
        next.days[key] = { checkins: state.days[key].checkins, points: state.days[key].points };
      }
    }

    var buckets = state.beacons || {};
    for (var id in buckets) {
      if (!Object.prototype.hasOwnProperty.call(buckets, id)) continue;
      var bucket = buckets[id];
      next.beacons[id] = {
        name: bucket.name,
        points: bucket.points,
        since: bucket.since,
        lastDay: bucket.lastDay
      };
    }

    return next;
  }

  // 'new' | 'done' | 'at-risk' | 'cold'
  function statusOf(state, now) {
    if (!state.lastDay) return 'new';
    var gap = daysBetween(state.lastDay, now);
    if (gap === 0) return 'done';
    if (gap === 1) return 'at-risk';
    return 'cold';
  }

  // A check-in that scores adds exactly one point to the beacon you hold.
  function creditBeacon(state, today) {
    if (!state.beacon) return;
    var key = state.beacon.key;
    var bucket = state.beacons[key] || {
      name: state.beacon.name,
      points: 0,
      since: state.beacon.since || today,
      lastDay: null
    };
    bucket.points = (bucket.points || 0) + 1;
    bucket.lastDay = today;
    state.beacons[key] = bucket;
  }

  // Pure: returns a new state plus what this check-in earned.
  function checkIn(state, now) {
    var today = dayKey(now);
    var next = cloneState(state);

    // Every press counts here, scored or not.
    next.clicks += 1;

    var todays = next.days[today] || { checkins: 0, points: 0 };

    // Extra check-ins on the same day are welcome but already counted.
    if (todays.checkins > 0) {
      todays.checkins += 1;
      next.days[today] = todays;
      return {
        state: next,
        result: {
          alreadyToday: true,
          points: 0,
          multiplier: multiplierFor(next.streak),
          streak: next.streak,
          streakBroken: false,
          beacon: null
        }
      };
    }

    var gap = next.lastDay ? daysBetween(next.lastDay, now) : null;
    var streak;
    var streakBroken = false;

    if (gap === 1) {
      streak = next.streak + 1;
    } else if (gap === 0) {
      streak = Math.max(1, next.streak);
    } else {
      streakBroken = next.streak > 1 && gap !== null;
      streak = 1;
    }

    var multiplier = multiplierFor(streak);
    var points = Math.round(multiplier * 10) / 10;

    next.streak = streak;
    next.lastDay = today;
    next.score = Math.round((next.score + points) * 10) / 10;
    next.days[today] = { checkins: 1, points: points };
    creditBeacon(next, today);

    return {
      state: next,
      result: {
        alreadyToday: false,
        points: points,
        multiplier: multiplier,
        streak: streak,
        streakBroken: streakBroken,
        beacon: next.beacon ? next.beacon.name : null
      }
    };
  }

  // Hold a beacon. Points already given to an earlier beacon stay with it, and
  // picking a beacon you held before brings its tally back.
  function assignBeacon(state, name, now) {
    var check = checkBeacon(name);
    if (!check.ok) throw new Error(check.error);

    var today = dayKey(now || new Date());
    var next = cloneState(state);
    var bucket = next.beacons[check.key] || null;
    var carriedSince = next.beacon && next.beacon.key === check.key ? next.beacon.since : null;

    if (!bucket) {
      bucket = {
        name: check.name,
        points: 0,
        since: carriedSince || today,
        lastDay: null
      };
      next.beacons[check.key] = bucket;
    } else {
      bucket.name = check.name;
    }

    next.beacon = {
      name: check.name,
      key: check.key,
      since: carriedSince || bucket.since || today
    };

    return next;
  }

  function dropBeacon(state) {
    var next = cloneState(state);
    next.beacon = null;
    return next;
  }

  function beaconStats(state) {
    if (!state.beacon) return { points: 0, since: null, lastDay: null };
    var bucket = state.beacons ? state.beacons[state.beacon.key] : null;
    return {
      points: bucket ? bucket.points : 0,
      since: state.beacon.since || (bucket ? bucket.since : null) || null,
      lastDay: bucket ? bucket.lastDay : null
    };
  }

  // ---------- Sync codes ----------

  var CODE_PREFIX = 'DSC1';
  var CODE_HISTORY = 400; // most recent checked-in days carried in a code

  function fnv(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function toBase64Url(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(text) {
    var padded = text.replace(/-/g, '+').replace(/_/g, '/');
    while (padded.length % 4) padded += '=';
    var binary = atob(padded);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function previousKey(key) {
    var date = dayFromKey(key);
    date.setDate(date.getDate() - 1);
    return dayKey(date);
  }

  // Length of the consecutive run of checked-in days ending at `lastDay`.
  function streakEndingAt(days, lastDay) {
    if (!lastDay || !days[lastDay]) return 0;
    var count = 0;
    var key = lastDay;
    while (days[key]) {
      count++;
      key = previousKey(key);
    }
    return count;
  }

  function encode(state) {
    var keys = Object.keys(state.days).sort().slice(-CODE_HISTORY);
    var rows = [];
    for (var i = 0; i < keys.length; i++) {
      var entry = state.days[keys[i]];
      rows.push([keys[i].replace(/-/g, ''), entry.checkins, entry.points]);
    }

    var stats = beaconStats(state);
    var payload = {
      v: 1,
      s: state.score,
      l: state.lastDay,
      c: Math.max(0, Math.floor(Number(state.clicks) || 0)),
      t: cleanToken(state.token),
      b: state.beacon ? [state.beacon.name, state.beacon.since, stats.points, stats.lastDay] : null,
      d: rows
    };

    var json = JSON.stringify(payload);
    return CODE_PREFIX + '-' + fnv(json) + '-' + toBase64Url(json);
  }

  function decode(code) {
    var clean = String(code || '').replace(/[^A-Za-z0-9_-]/g, '');
    var match = /^DSC1-([0-9a-f]{8})-(.+)$/.exec(clean);
    if (!match) throw new Error('That does not look like a sync code. It starts with DSC1-');

    var json;
    try {
      json = fromBase64Url(match[2]);
    } catch (err) {
      throw new Error('That code could not be read. Check that you copied all of it.');
    }
    if (fnv(json) !== match[1]) {
      throw new Error('That code looks incomplete. Copy all of it, including the last characters.');
    }

    var payload;
    try {
      payload = JSON.parse(json);
    } catch (err) {
      throw new Error('That code could not be read. Check that you copied all of it.');
    }
    if (!payload || payload.v !== 1 || !Array.isArray(payload.d)) {
      throw new Error('That sync code is from a version this app does not understand.');
    }

    var state = emptyState();
    state.score = Math.max(0, Math.round((Number(payload.s) || 0) * 10) / 10);
    state.lastDay = isDayKey(payload.l) ? payload.l : null;
    state.clicks = Math.max(0, Math.floor(Number(payload.c) || 0));
    state.token = cleanToken(payload.t);

    for (var i = 0; i < payload.d.length; i++) {
      var row = payload.d[i];
      if (!Array.isArray(row) || row.length < 3) continue;
      var digits = String(row[0]);
      if (!/^\d{8}$/.test(digits)) continue;
      var key = digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6, 8);
      var checkins = Math.max(1, Math.round(Number(row[1]) || 1));
      var points = Math.max(0, Math.round((Number(row[2]) || 0) * 10) / 10);
      state.days[key] = { checkins: checkins, points: points };
    }

    if (Array.isArray(payload.b)) {
      var beacon = cleanBeacon({ name: payload.b[0], since: payload.b[1] });
      if (beacon) {
        var carried = Math.max(0, Math.round(Number(payload.b[2]) || 0));
        state.beacon = beacon;
        state.beacons[beacon.key] = {
          name: beacon.name,
          points: carried,
          since: beacon.since,
          lastDay: isDayKey(payload.b[3]) ? payload.b[3] : null
        };
      }
    }

    if (state.lastDay && !state.days[state.lastDay]) state.lastDay = null;
    if (!state.lastDay) {
      var allKeys = Object.keys(state.days).sort();
      state.lastDay = allKeys.length ? allKeys[allKeys.length - 1] : null;
    }
    state.streak = streakEndingAt(state.days, state.lastDay);
    return state;
  }

  // Combine two histories without losing points: days are unioned, keeping
  // the best result per day, and the score never goes down.
  function merge(a, b) {
    var out = emptyState();
    var sources = [a.days || {}, b.days || {}];

    for (var s = 0; s < sources.length; s++) {
      for (var key in sources[s]) {
        if (!Object.prototype.hasOwnProperty.call(sources[s], key)) continue;
        var entry = sources[s][key];
        var current = out.days[key];
        out.days[key] = {
          checkins: Math.max(current ? current.checkins : 0, Number(entry.checkins) || 0),
          points: Math.max(current ? current.points : 0, Number(entry.points) || 0)
        };
      }
    }

    var sum = 0;
    for (var day in out.days) {
      if (Object.prototype.hasOwnProperty.call(out.days, day)) sum += out.days[day].points;
    }

    var score = Math.max(Number(a.score) || 0, Number(b.score) || 0, sum);
    out.score = Math.round(score * 10) / 10;
    out.clicks = Math.max(Number(a.clicks) || 0, Number(b.clicks) || 0);

    var candidates = [a.lastDay, b.lastDay].filter(function (value) {
      return isDayKey(value);
    });
    candidates.sort();
    out.lastDay = candidates.length ? candidates[candidates.length - 1] : null;
    out.streak = streakEndingAt(out.days, out.lastDay);

    // Your own beacon wins over one arriving in a code, so restoring never
    // hands your identity to whoever made the code.
    out.beacon = cleanBeacon(a.beacon) || cleanBeacon(b.beacon);

    // A device that already has a player key keeps it; a fresh one adopts the
    // key from the code so both devices are the same player on the board.
    out.token = cleanToken(a.token) || cleanToken(b.token);
    out.handle = cleanHandle(a.handle);
    // The server's copy is re-read by the first sync, which also re-asserts the
    // beacon and name this device holds.
    out.serverBeacon = "";
    out.serverHandle = "";

    var beaconSources = [a.beacons || {}, b.beacons || {}];
    for (var t = 0; t < beaconSources.length; t++) {
      for (var id in beaconSources[t]) {
        if (!Object.prototype.hasOwnProperty.call(beaconSources[t], id)) continue;
        var bucket = beaconSources[t][id];
        var known = out.beacons[id];
        out.beacons[id] = {
          name: known && known.name ? known.name : bucket.name,
          points: Math.max(known ? known.points : 0, Number(bucket.points) || 0),
          since: earliest(known ? known.since : null, bucket.since),
          lastDay: latest(known ? known.lastDay : null, bucket.lastDay)
        };
      }
    }

    return out;
  }

  var api = {
    TIERS: TIERS,
    BEACON_MIN: BEACON_MIN,
    BEACON_MAX: BEACON_MAX,
    dayKey: dayKey,
    dayFromKey: dayFromKey,
    daysBetween: daysBetween,
    multiplierFor: multiplierFor,
    nextTier: nextTier,
    currentTier: currentTier,
    rankFor: rankFor,
    emptyState: emptyState,
    statusOf: statusOf,
    checkIn: checkIn,
    checkBeacon: checkBeacon,
    beaconKey: beaconKey,
    cleanBeacon: cleanBeacon,
    cleanBuckets: cleanBuckets,
    cleanToken: cleanToken,
    cleanHandle: cleanHandle,
    assignBeacon: assignBeacon,
    dropBeacon: dropBeacon,
    beaconStats: beaconStats,
    streakEndingAt: streakEndingAt,
    encode: encode,
    decode: decode,
    merge: merge
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Scoring = api;
})(typeof window !== 'undefined' ? window : globalThis);
