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
    return { score: 0, streak: 0, lastDay: null, days: {} };
  }

  // 'new' | 'done' | 'at-risk' | 'cold'
  function statusOf(state, now) {
    if (!state.lastDay) return 'new';
    var gap = daysBetween(state.lastDay, now);
    if (gap === 0) return 'done';
    if (gap === 1) return 'at-risk';
    return 'cold';
  }

  // Pure: returns a new state plus what this check-in earned.
  function checkIn(state, now) {
    var today = dayKey(now);
    var next = {
      score: state.score,
      streak: state.streak,
      lastDay: state.lastDay,
      days: {}
    };
    for (var key in state.days) {
      if (Object.prototype.hasOwnProperty.call(state.days, key)) next.days[key] = state.days[key];
    }

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
          streakBroken: false
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

    return {
      state: next,
      result: {
        alreadyToday: false,
        points: points,
        multiplier: multiplier,
        streak: streak,
        streakBroken: streakBroken
      }
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
    var json = JSON.stringify({ v: 1, s: state.score, l: state.lastDay, d: rows });
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
    state.lastDay = typeof payload.l === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.l) ? payload.l : null;

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
    var seen = {};
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
        seen[key] = true;
      }
    }

    var sum = 0;
    for (var day in out.days) {
      if (Object.prototype.hasOwnProperty.call(out.days, day)) sum += out.days[day].points;
    }

    var score = Math.max(Number(a.score) || 0, Number(b.score) || 0, sum);
    out.score = Math.round(score * 10) / 10;

    var candidates = [a.lastDay, b.lastDay].filter(function (value) {
      return typeof value === 'string' && value;
    });
    candidates.sort();
    out.lastDay = candidates.length ? candidates[candidates.length - 1] : null;
    out.streak = streakEndingAt(out.days, out.lastDay);
    return out;
  }

  var api = {
    TIERS: TIERS,
    dayKey: dayKey,
    daysBetween: daysBetween,
    multiplierFor: multiplierFor,
    nextTier: nextTier,
    currentTier: currentTier,
    rankFor: rankFor,
    emptyState: emptyState,
    statusOf: statusOf,
    checkIn: checkIn,
    streakEndingAt: streakEndingAt,
    encode: encode,
    decode: decode,
    merge: merge
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Scoring = api;
})(typeof window !== 'undefined' ? window : globalThis);
