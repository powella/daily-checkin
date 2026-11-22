(function () {
  'use strict';

  var STORAGE_KEY = 'daily-score.v1';
  var S = window.Scoring;

  var el = {
    score: document.getElementById('score'),
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
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
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

  function defaultMessage(state, now) {
    var status = S.statusOf(state, now);
    if (status === 'done') return 'Already counted today. Extra check-ins are just for fun — come back tomorrow.';
    if (status === 'at-risk') return 'Check in today to keep your ' + state.streak + '-day streak alive.';
    if (status === 'cold') return 'Your streak went cold. Check in to start a new one.';
    return 'One check-in a day is all it takes. Day one starts now.';
  }

  function render(state, now) {
    el.score.textContent = formatPoints(state.score);
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
  }

  function messageFor(result) {
    if (result.alreadyToday) {
      return 'Already counted for today — no extra points, but the streak is safe.';
    }
    var text = 'Checked in — +' + formatPoints(result.points) + ' point' + (result.points === 1 ? '' : 's') +
      ' at ' + formatMultiplier(result.multiplier) + '.';
    if (result.streakBroken) text += ' Your streak restarted at day 1.';
    else if (result.streak > 1) text += ' Day ' + result.streak + ' of your streak.';
    return text;
  }


  var state = load();
  var now = new Date();
  render(state, now);
  el.message.textContent = defaultMessage(state, now);

  el.button.addEventListener('click', function () {
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
