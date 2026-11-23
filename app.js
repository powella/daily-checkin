(function () {
  'use strict';

  var STORAGE_KEY = 'daily-score.v1';
  var S = window.Scoring;

  var el = {
    score: document.getElementById('score'),
    clicks: document.getElementById('clicks-count'),
    rank: document.getElementById('rank'),
    streak: document.getElementById('streak'),
    multiplier: document.getElementById('multiplier'),
    button: document.getElementById('checkin'),
    message: document.getElementById('message'),
    strip: document.getElementById('days'),
    tierText: document.getElementById('tier-text'),
    tierFill: document.getElementById('tier-fill')
  };

  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return S.emptyState();
      var parsed = JSON.parse(raw);
      var state = S.emptyState();
      state.score = Number(parsed.score) || 0;
      state.streak = Number(parsed.streak) || 0;
      state.lastDay = typeof parsed.lastDay === 'string' ? parsed.lastDay : null;
      if (parsed.days && typeof parsed.days === 'object') {
        for (var key in parsed.days) {
          if (Object.prototype.hasOwnProperty.call(parsed.days, key)) {
            var entry = parsed.days[key];
            state.days[key] = {
              checkins: Number(entry.checkins) || 0,
              points: Number(entry.points) || 0
            };
          }
        }
      }
      state.beacon = S.cleanBeacon(parsed.beacon);
      state.beacons = S.cleanBuckets(parsed.beacons);
      state.clicks = Math.max(0, Math.floor(Number(parsed.clicks) || 0));
      state.token = S.cleanToken(parsed.token);
      state.handle = S.cleanHandle(parsed.handle);
      state.serverBeacon = typeof parsed.serverBeacon === 'string' ? parsed.serverBeacon : '';
      state.serverHandle = typeof parsed.serverHandle === 'string' ? parsed.serverHandle : '';
      return state;
    } catch (err) {
      return S.emptyState();
    }
  }

  function save(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* storage full or blocked: the app still works for this visit */
    }
  }

  function formatPoints(n) {
    var value = Number(n);
    if (!isFinite(value)) return '0';
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function formatMultiplier(n) {
    return '×' + (Number.isInteger(n) ? String(n) : n.toFixed(1));
  }

  function renderDays(state, now) {
    el.strip.innerHTML = '';
    var letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    for (var offset = 13; offset >= 0; offset--) {
      var date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
      var key = S.dayKey(date);
      var entry = state.days[key];
      var cell = document.createElement('div');
      cell.className = 'day';

      var label = document.createElement('span');
      label.className = 'day-letter';
      label.textContent = letters[date.getDay()];

      var dot = document.createElement('span');
      dot.className = 'day-dot';
      if (entry && entry.checkins > 0) {
        dot.classList.add('is-filled');
        if (entry.points > 0) dot.classList.add('is-scoring');
        dot.textContent = String(date.getDate());
        cell.title = date.toDateString() + ' — +' + formatPoints(entry.points) + ' points' +
          (entry.checkins > 1 ? ' (' + entry.checkins + ' check-ins)' : '');
      } else {
        if (offset === 0) dot.classList.add('is-today');
        dot.textContent = String(date.getDate());
        cell.title = date.toDateString() + ' — no check-in';
      }

      cell.appendChild(label);
      cell.appendChild(dot);
      el.strip.appendChild(cell);
    }
  }

  function renderTier(state) {
    var streak = state.streak;
    var next = S.nextTier(streak);
    var current = S.currentTier(streak);

    if (!next) {
      el.tierText.textContent = 'Max multiplier reached — keep the streak alive.';
      el.tierFill.style.width = '100%';
      return;
    }

    var span = next.min - current.min;
    var done = Math.min(Math.max(streak - current.min, 0), span);
    var width = span > 0 ? Math.round((done / span) * 100) : 0;
    var remaining = next.min - streak;

    el.tierText.textContent = remaining === 1
      ? '1 more day to ' + formatMultiplier(next.mult)
      : remaining + ' more days to ' + formatMultiplier(next.mult);
    el.tierFill.style.width = Math.max(width, 6) + '%';
  }

  // ---------- Beacon ----------

  var beacon = {
    lamp: document.getElementById('beacon-lamp'),
    name: document.getElementById('beacon-name'),
    score: document.getElementById('beacon-score'),
    meta: document.getElementById('beacon-meta'),
    form: document.getElementById('beacon-form'),
    input: document.getElementById('beacon-input'),
    submit: document.getElementById('beacon-set'),
    drop: document.getElementById('beacon-drop'),
    error: document.getElementById('beacon-error')
  };

  var BEACON_HINT = 'Pick a word or a name your circle shares. Every check-in adds a point to it, so everyone on the same beacon pools their points.';

  // ---------- Shared circles (api/) ----------
  //
  // The score, streak and history above stay on this device. The server only
  // keeps one row per player per day, so it can pool points under beacons. When
  // it cannot be reached the app behaves exactly as it did before: local only.

  var API = 'api/';

  var net = {
    status: 'unknown', // 'unknown' | 'ok' | 'down'
    circle: null,
    circles: [],
    individual: [],
    countries: [],
    you: null,
    syncing: false
  };

  var queued = false;
  var boardTab = 'circles';
  var regionNames = null;

  var netStatus = document.getElementById('net-status');
  var boardsCard = document.getElementById('boards-card');
  var boardTabs = {
    individual: document.getElementById('tab-individual'),
    circles: document.getElementById('tab-circles'),
    countries: document.getElementById('tab-countries')
  };
  var boardPanels = {
    individual: document.getElementById('board-individual'),
    circles: document.getElementById('board-circles'),
    countries: document.getElementById('board-countries')
  };
  var boardLists = {
    individual: document.getElementById('board-individual-list'),
    circles: document.getElementById('board-circles-list'),
    countries: document.getElementById('board-countries-list')
  };
  var boardEmpties = {
    individual: document.getElementById('board-individual-empty'),
    circles: document.getElementById('board-circles-empty'),
    countries: document.getElementById('board-countries-empty')
  };
  var boardYou = document.getElementById('board-you');
  var nameForm = document.getElementById('name-form');
  var nameInput = document.getElementById('name-input');
  var nameError = document.getElementById('name-error');

  function newToken() {
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }

    var out = '';
    for (var b = 0; b < bytes.length; b++) {
      out += ('0' + bytes[b].toString(16)).slice(-2);
    }
    return out;
  }

  function apiPost(path, body) {
    return new Promise(function (resolve, reject) {
      // A promise keeps its first result, so a late answer after the timeout is
      // simply ignored.
      var timer = window.setTimeout(function () {
        reject(new Error('The server took too long to answer.'));
      }, 7000);

      fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store'
      }).then(function (response) {
        return response.text().then(function (text) {
          var data = null;
          try { data = JSON.parse(text); } catch (err) { data = null; }
          window.clearTimeout(timer);

          if (data && data.ok) {
            resolve(data);
            return;
          }

          var error = new Error((data && data.error) || 'The server could not be reached.');
          error.status = response.status;
          reject(error);
        });
      }).catch(function (error) {
        window.clearTimeout(timer);
        reject(error);
      });
    });
  }

  function syncBoard() {
    if (net.syncing) {
      queued = true;
      return;
    }

    if (!state.token) {
      state.token = newToken();
      save(state);
    }

    var beaconAtSend = state.beacon ? state.beacon.name : '';
    var handleAtSend = state.handle;
    var body = { token: state.token };

    if (state.lastDay && state.days[state.lastDay]) {
      body.checkin = true;
      body.day = state.lastDay;
    }

    // Only send what the server has not confirmed yet; '' means "drop it".
    if (S.beaconKey(beaconAtSend) !== state.serverBeacon) body.beacon = beaconAtSend;
    if (handleAtSend !== state.serverHandle) body.handle = handleAtSend;

    net.syncing = true;

    apiPost('sync.cfm', body).then(function (data) {
      net.status = 'ok';
      beacon.error.textContent = '';
      nameError.textContent = '';
      net.circle = data.beacon || null;
      net.circles = Array.isArray(data.circles) ? data.circles : [];
      net.individual = Array.isArray(data.individual) ? data.individual : [];
      net.countries = Array.isArray(data.countries) ? data.countries : [];
      net.you = data.you || null;
      state.serverBeacon = data.beacon ? S.beaconKey(data.beacon.name) : '';
      state.serverHandle = typeof data.handle === 'string' ? data.handle : '';

      // The server's copy wins unless this device changed the beacon while the
      // request was in flight; then the next sync carries the newer one.
      if ((state.beacon ? state.beacon.name : '') === beaconAtSend) {
        if (data.beacon) {
          var shared = S.cleanBeacon({ name: data.beacon.name, since: data.beacon.since });
          if (shared) {
            state.beacon = shared;
            var bucket = state.beacons[shared.key];
            if (bucket) bucket.name = shared.name;
          }
        } else {
          state.beacon = null;
        }
      }

      if (state.handle === handleAtSend) state.handle = state.serverHandle;

      save(state);
      render(state, new Date());
      renderBoards();
    }).catch(function (error) {
      var status = error && error.status;
      if (!status || status >= 500) net.status = 'down';

      // A refused beacon or name means the server is there; only the value is wrong.
      if (status === 400 && error.message) {
        if (typeof body.handle === 'string') {
          nameError.textContent = 'That name could not be saved: ' + error.message;
        } else if (typeof body.beacon === 'string') {
          beacon.error.textContent = 'This beacon could not be shared: ' + error.message;
        }
      }

      renderBeacon(state);
      renderBoards();
    }).then(function () {
      net.syncing = false;
      if (queued) {
        queued = false;
        window.setTimeout(syncBoard, 0);
      }
    });
  }

  function countryName(code) {
    if (!code) return 'Unknown';
    try {
      if (!regionNames) regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
      return regionNames.of(code) || code;
    } catch (err) {
      return code;
    }
  }

  function renderBoardRows(kind, list, rows, emptyEl) {
    list.innerHTML = '';

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var item = document.createElement('li');
      item.className = 'board-row';

      if (row.isYou) item.classList.add('is-mine');
      if (kind === 'circles' && state.beacon && row.name && S.beaconKey(row.name) === state.beacon.key) {
        item.classList.add('is-mine');
      }

      var rank = document.createElement('span');
      rank.className = 'board-rank';
      rank.textContent = String(i + 1);

      var label = document.createElement('span');
      label.className = 'board-name';
      if (kind === 'countries') label.textContent = countryName(row.code);
      else if (kind === 'individual') label.textContent = row.handle;
      else label.textContent = row.name;

      var people = document.createElement('span');
      people.className = 'board-people';
      var members = Number(row.members) || 0;
      people.textContent = kind === 'individual' ? '' : (members === 1 ? '1 person' : members + ' people');

      var points = document.createElement('span');
      points.className = 'board-points';
      points.textContent = formatPoints(row.points);

      item.appendChild(rank);
      item.appendChild(label);
      item.appendChild(people);
      item.appendChild(points);
      list.appendChild(item);
    }

    emptyEl.hidden = rows.length > 0;
    list.hidden = rows.length === 0;
  }

  function renderBoards() {
    var live = net.status === 'ok';

    netStatus.hidden = net.status !== 'down';
    netStatus.textContent = net.status === 'down'
      ? 'Shared board not connected — your score still counts here. Boards catch up when it answers.'
      : '';

    boardsCard.hidden = !live;
    if (!live) return;

    var names = ['individual', 'circles', 'countries'];
    for (var i = 0; i < names.length; i++) {
      boardPanels[names[i]].hidden = names[i] !== boardTab;
    }

    renderBoardRows('individual', boardLists.individual, net.individual || [], boardEmpties.individual);
    renderBoardRows('circles', boardLists.circles, net.circles || [], boardEmpties.circles);
    renderBoardRows('countries', boardLists.countries, net.countries || [], boardEmpties.countries);

    var you = net.you;
    if (you) {
      var suffix = state.handle ? ' Playing as ' + state.handle + '.' : '';
      boardYou.textContent = Number(you.points) > 0
        ? 'You: #' + you.rank + ' of ' + you.players + ' players — ' + formatPoints(you.points) + ' check-ins.' + suffix
        : 'You: no check-ins yet.' + suffix;
    } else {
      boardYou.textContent = '';
    }

    nameInput.placeholder = state.handle || 'Your name on the board';
  }

  function setBoardTab(name) {
    boardTab = name;
    var names = ['individual', 'circles', 'countries'];

    for (var i = 0; i < names.length; i++) {
      var tab = boardTabs[names[i]];
      var on = names[i] === name;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    }

    renderBoards();
  }

  boardTabs.individual.addEventListener('click', function () { setBoardTab('individual'); });
  boardTabs.circles.addEventListener('click', function () { setBoardTab('circles'); });
  boardTabs.countries.addEventListener('click', function () { setBoardTab('countries'); });

  nameForm.addEventListener('submit', function (event) {
    event.preventDefault();

    var raw = nameInput.value.replace(/\s+/g, ' ').trim();

    if (!raw) {
      state.handle = '';
      save(state);
      nameError.textContent = '';
      nameInput.value = '';
      renderBoards();
      syncBoard();
      return;
    }

    var check = S.checkBeacon(raw);
    if (!check.ok) {
      nameError.textContent = check.error;
      nameInput.focus();
      return;
    }

    state.handle = check.name;
    save(state);
    nameError.textContent = '';
    nameInput.value = '';
    renderBoards();
    syncBoard();
  });

  function shortDay(key) {
    if (!key) return '';
    try {
      return S.dayFromKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (err) {
      return '';
    }
  }

  function renderBeacon(state) {
    var active = state.beacon;
    var local = S.beaconStats(state);
    var circle = active && net.circle &&
      S.beaconKey(net.circle.name) === S.beaconKey(active.name) ? net.circle : null;

    beacon.name.textContent = active ? active.name : 'No beacon yet';
    beacon.name.classList.toggle('is-set', Boolean(active));
    beacon.lamp.classList.toggle('is-on', Boolean(active));
    beacon.score.hidden = !active;

    if (active) {
      var points = Number(circle ? circle.points : local.points) || 0;
      beacon.score.textContent = formatPoints(points) + (points === 1 ? ' point' : ' points');

      var since = shortDay(active.since);
      var text;

      if (circle) {
        var members = Number(circle.members) || 0;
        var people = members === 1 ? '1 person' : members + ' people';
        text = members > 1
          ? 'Shared by ' + people + ' — ' + formatPoints(points) + ' points pooled. You added ' + formatPoints(circle.yours) + '.'
          : 'First one on this beacon. Every check-in adds a point; anyone who picks it pools points with you.';
        if (since) text = 'Yours since ' + since + '. ' + text;
      } else {
        text = (since ? 'Yours since ' + since + '. ' : '') +
          'Every check-in adds one point; anyone holding the same beacon pools points with you.';
        if (net.status === 'down') {
          text += ' This is your own tally until the shared board answers.';
        }
      }

      beacon.meta.textContent = text;
      beacon.input.placeholder = active.name;
    } else {
      beacon.meta.textContent = BEACON_HINT;
      beacon.input.placeholder = 'red · chocolate · Captain Kirk';
    }

    beacon.submit.textContent = active ? 'Change' : 'Set';
    beacon.drop.hidden = !active;
  }

  function defaultMessage(state, now) {
    var status = S.statusOf(state, now);
    if (status === 'done') return 'Already counted today. Extra check-ins are just for fun — come back tomorrow.';
    if (status === 'at-risk') return 'Check in today to keep your ' + state.streak + '-day streak alive.';
    if (status === 'cold') return 'Your streak went cold. Check in to start a new one.';
    return 'One check-in a day is all it takes. Day one starts now.';
  }

  function render(state, now) {
    var clicks = Math.max(0, Math.floor(Number(state.clicks) || 0));

    el.score.textContent = formatPoints(state.score);
    el.clicks.textContent = clicks + (clicks === 1 ? ' click total' : ' clicks total');
    el.rank.textContent = S.rankFor(state.score);
    el.streak.textContent = state.streak > 0
      ? state.streak + '-day streak'
      : 'No streak yet';
    el.multiplier.textContent = formatMultiplier(S.multiplierFor(state.streak));

    var status = S.statusOf(state, now);
    el.button.textContent = status === 'done' ? 'Check in again' : 'Check in';
    el.button.classList.toggle('is-done', status === 'done');

    renderDays(state, now);
    renderTier(state);
    renderBeacon(state);
    renderBoards();
  }

  var rippleLayer = document.getElementById('ripples');

  // Rings from the point that was pressed, sized in viewport pixels so they
  // spread past the button the way a circle should.
  function rippleFrom(event) {
    if (!rippleLayer) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var rect = el.button.getBoundingClientRect();
    var pressed = event && (event.clientX || event.clientY);
    var x = pressed ? event.clientX : rect.left + rect.width / 2;
    var y = pressed ? event.clientY : rect.top + rect.height / 2;

    for (var i = 0; i < 3; i++) {
      var ring = document.createElement('span');
      ring.className = i === 1 ? 'ripple ripple-alt' : 'ripple';
      ring.style.left = x + 'px';
      ring.style.top = y + 'px';
      ring.style.animationDelay = (i * 110) + 'ms';
      rippleLayer.appendChild(ring);
      window.setTimeout(removeRing, 1500, ring);
    }
  }

  function removeRing(ring) {
    if (ring && ring.parentNode) ring.parentNode.removeChild(ring);
  }

  function messageFor(result) {
    if (result.alreadyToday) {
      return 'Already counted for today — no extra points, but the streak is safe.';
    }
    var text = 'Checked in — +' + formatPoints(result.points) + ' point' + (result.points === 1 ? '' : 's') +
      ' at ' + formatMultiplier(result.multiplier) + '.';
    if (result.beacon) text += ' ' + result.beacon + ' got a point too.';
    if (result.streakBroken) text += ' Your streak restarted at day 1.';
    else if (result.streak > 1) text += ' Day ' + result.streak + ' of your streak.';
    return text;
  }


  var state = load();
  var now = new Date();
  render(state, now);
  el.message.textContent = defaultMessage(state, now);
  syncBoard();

  window.addEventListener('online', function () {
    syncBoard();
  });

  el.button.addEventListener('click', function (event) {
    rippleFrom(event);

    var today = new Date();
    var outcome = S.checkIn(state, today);
    state = outcome.state;
    save(state);
    render(state, today);
    el.message.textContent = messageFor(outcome.result);

    el.score.classList.remove('bump');
    void el.score.offsetWidth;
    el.score.classList.add('bump');
    el.multiplier.classList.remove('bump');
    void el.multiplier.offsetWidth;
    el.multiplier.classList.add('bump');

    syncBoard();
  });

  // ---------- Beacon ----------

  beacon.form.addEventListener('submit', function (event) {
    event.preventDefault();

    var check = S.checkBeacon(beacon.input.value);
    if (!check.ok) {
      beacon.error.textContent = check.error;
      beacon.input.focus();
      return;
    }

    var previous = state.beacon;
    if (previous && previous.key === check.key) {
      beacon.error.textContent = '';
      beacon.input.value = '';
      beacon.meta.textContent = 'That is already your beacon.';
      return;
    }

    state = S.assignBeacon(state, check.name);
    save(state);
    beacon.error.textContent = '';
    beacon.input.value = '';
    renderBeacon(state);
    beacon.meta.textContent = previous
      ? 'Beacon changed to ' + check.name + '. Points you already gave ' + previous.name + ' stay with it.'
      : 'Beacon set. Your next check-in adds a point to ' + check.name + '.';
    syncBoard();
  });

  beacon.drop.addEventListener('click', function () {
    if (!state.beacon) return;
    var dropped = state.beacon.name;
    state = S.dropBeacon(state);
    save(state);
    beacon.error.textContent = '';
    renderBeacon(state);
    beacon.meta.textContent = 'Dropped ' + dropped + '. Your own score and streak are untouched — pick a beacon again whenever you like.';
    syncBoard();
  });

  // ---------- Sync codes ----------

  var sync = {
    details: document.getElementById('sync'),
    make: document.getElementById('make-code'),
    out: document.getElementById('code-out'),
    copy: document.getElementById('copy-code'),
    input: document.getElementById('code-in'),
    restore: document.getElementById('restore'),
    status: document.getElementById('sync-status')
  };

  function setSyncStatus(text, isError) {
    sync.status.textContent = text;
    sync.status.classList.toggle('is-error', Boolean(isError));
  }

  sync.make.addEventListener('click', function () {
    if (!state.lastDay) {
      setSyncStatus('Check in once first — a code only becomes useful with some history in it.', true);
      return;
    }
    sync.out.value = S.encode(state);
    sync.out.focus();
    sync.out.select();
    setSyncStatus('Code ready. Copy it and keep it somewhere private, then paste it on your other device.');
  });

  sync.copy.addEventListener('click', function () {
    if (!sync.out.value) {
      sync.make.click();
      if (!sync.out.value) return;
    }

    var text = sync.out.value;

    function manualCopy() {
      sync.out.focus();
      sync.out.select();
      setSyncStatus('Press copy (or Ctrl/Cmd+C) to copy the code.', true);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        setSyncStatus('Copied. Keep it private — it holds your whole score and history.');
      }, manualCopy);
    } else {
      manualCopy();
    }
  });

  sync.restore.addEventListener('click', function () {
    var raw = sync.input.value;
    if (!raw.trim()) {
      setSyncStatus('Paste a sync code first.', true);
      return;
    }

    var incoming;
    try {
      incoming = S.decode(raw);
    } catch (err) {
      setSyncStatus(err.message, true);
      return;
    }

    if (!incoming.lastDay) {
      setSyncStatus('That code has no check-ins in it yet.', true);
      return;
    }

    var previous = state;
    state = S.merge(state, incoming);
    save(state);

    var today = new Date();
    render(state, today);
    el.message.textContent = defaultMessage(state, today);
    syncBoard();

    var gained = Math.round((state.score - previous.score) * 10) / 10;
    var text = 'Restored — score ' + formatPoints(state.score) + ', ' + state.streak + '-day streak.';
    if (gained > 0) {
      text += ' ' + formatPoints(gained) + ' points came over from the code.';
    } else if (state.streak === previous.streak) {
      text += ' This device already had everything in that code.';
    }
    setSyncStatus(text);
    sync.input.value = '';
  });
})();
