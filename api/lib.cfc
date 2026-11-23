component output="false" {

  // ---------------------------------------------------------------------------
  // Setup
  //
  // Create a datasource with this name in the ColdFusion Administrator
  // (Data & Services > Data Sources > Add New > MySQL/MariaDB), then point it at
  // the database that holds db/schema.sql. That is the only setting here you
  // should need to change.
  // ---------------------------------------------------------------------------
  variables.dsn = "dailyCheckInApp";

  // ---------------------------------------------------------------------------
  // Beacon rules
  //
  // The browser screens names first for a friendly message. This copy is the one
  // that protects the shared board, so it has to stand on its own. Keep the
  // lists in step with scoring.js when you add words.
  // ---------------------------------------------------------------------------
  variables.beaconMin = 2;
  variables.beaconMax = 24;

  variables.reserved = [
    "admin", "administrator", "support", "mod", "moderator", "staff", "official",
    "system", "root", "daily", "leaderboard", "leader board", "me", "you", "none",
    "null", "anonymous", "everyone", "anyone", "deleted", "app"
  ];

  variables.bannedTokens = [
    "arse", "arsehole", "ass", "asshole", "asshat", "bastard", "bitch", "bitches",
    "blowjob", "bollocks", "boner", "boob", "boobs", "bugger", "cock", "cockhead",
    "crap", "cum", "cunt", "cunts", "dick", "dickhead", "dicks", "dildo", "douche",
    "douchebag", "dyke", "fag", "faggot", "faggots", "fags", "fuck", "fucked",
    "fucker", "fuckers", "fucking", "gook", "handjob", "horny", "jackass", "jerkoff",
    "kike", "kkk", "knob", "knobhead", "nazi", "nazis", "negro", "nigga", "niggas",
    "nigger", "niggers", "nutsack", "orgy", "paedo", "paedophile", "pedo",
    "pedophile", "penis", "piss", "porn", "porno", "prick", "pube", "pubes", "pussy",
    "queer", "rape", "raped", "rapist", "retard", "retarded", "scrotum", "semen",
    "sex", "sexy", "shag", "shit", "shite", "shits", "shitty", "skank", "slut",
    "sluts", "spic", "spick", "tits", "titty", "tosser", "tranny", "twat", "vagina",
    "wank", "wanker", "whore", "whores", "wog", "wop"
  ];

  variables.bannedStems = [
    "asshole", "bitch", "blowjob", "cunt", "dickhead", "faggot", "fuck", "handjob",
    "hitler", "jackoff", "motherfuck", "nazi", "nigg", "paedophil", "pedophil",
    "porn", "rapist", "retard", "shit", "tranny", "whore"
  ];

  variables.safeTokens = [
    "analog", "analogue", "analysis", "analyst", "assassin", "assassins", "assess",
    "assessment", "assume", "assumption", "bass", "bassoon", "brass", "class",
    "classes", "classic", "classy", "cockatoo", "cocktail", "constitution", "crass",
    "cucumber", "dickens", "dickinson", "document", "documentation", "essex", "glass",
    "grape", "grapefruit", "grapes", "grass", "hancock", "hello", "hitchcock", "mass",
    "masses", "middlesex", "pass", "passed", "passenger", "peacock", "penal",
    "penalty", "peninsula", "punctuation", "sassy", "scunthorpe", "shell", "shelter",
    "shitake", "shiitake", "sussex", "therapist", "therapy", "titan", "titrate"
  ];

  // ---------------------------------------------------------------------------
  // POST api/sync.cfm
  //
  // Body: { token, beacon?, handle?, day?, checkin? }
  //
  // One endpoint does everything the shared boards need:
  //   - finds or creates the player behind the token
  //   - applies a beacon or board-name change when the browser sends one
  //   - records the player's check-in for today (one row per player per day)
  //   - returns the player's beacon, their standing and the three boards
  //
  // The player's own score and streak stay in the browser: this table only
  // decides which beacon a check-in counts for.
  // ---------------------------------------------------------------------------
  public struct function sync() {

    if (cgi.request_method != "POST") {
      return fail(405, "POST a JSON body to this endpoint.");
    }

    var body = readJson();
    var token = cleanToken(field(body, "token"));
    if (!len(token)) return fail(400, "Missing or malformed player token.");

    try {
      var playerId = ensurePlayer(token);
      var clock = serverClock();

      // --- beacon change -----------------------------------------------------
      if (structKeyExists(body, "beacon")) {
        var wanted = isSimpleValue(body.beacon) ? trim(body.beacon) : "";

        if (!len(wanted)) {
          queryExecute(
            "UPDATE players SET beacon_id = NULL WHERE id = ?",
            [ strParam(playerId) ],
            { datasource: variables.dsn }
          );
        } else {
          var picked = resolveBeacon(wanted);
          if (!picked.ok) return fail(400, picked.error);
          queryExecute(
            "UPDATE players SET beacon_id = ? WHERE id = ?",
            [ intParam(picked.id), strParam(playerId) ],
            { datasource: variables.dsn }
          );
        }
      }

      // --- name on the individual board --------------------------------------
      if (structKeyExists(body, "handle")) {
        var wantedHandle = isSimpleValue(body.handle) ? trim(body.handle) : "";

        if (len(wantedHandle)) {
          var handleCheck = checkBeacon(wantedHandle);
          if (!handleCheck.ok) return fail(400, handleCheck.error);
          wantedHandle = handleCheck.name;
        }

        queryExecute(
          "UPDATE players SET handle = ? WHERE id = ?",
          [ strParam(wantedHandle), strParam(playerId) ],
          { datasource: variables.dsn }
        );
      }

      // --- today's check-in --------------------------------------------------
      // Only yesterday, today or tomorrow by the database clock, so a stale or
      // hand-made request cannot invent a long history. The primary key makes
      // repeat check-ins a no-op.
      var dayKey = cleanDay(field(body, "day"));
      var country = requestCountry();
      var wantsCheckin = field(body, "checkin") == true;

      if (wantsCheckin && len(dayKey) && listFind(clock.allowed, dayKey)) {
        var beaconId = scalar("SELECT beacon_id FROM players WHERE id = ?", [ strParam(playerId) ]);
        var already = scalar("SELECT COUNT(*) FROM checkins WHERE player_id = ? AND day = ?", [ strParam(playerId), strParam(dayKey) ]);

        if (!already) {
          if (len(beaconId)) {
            queryExecute(
              "INSERT IGNORE INTO checkins (player_id, day, beacon_id, country, created_at) VALUES (?, ?, ?, ?, NOW())",
              [ strParam(playerId), strParam(dayKey), intParam(beaconId), strParam(country) ],
              { datasource: variables.dsn }
            );
          } else {
            queryExecute(
              "INSERT IGNORE INTO checkins (player_id, day, beacon_id, country, created_at) VALUES (?, ?, NULL, ?, NOW())",
              [ strParam(playerId), strParam(dayKey), strParam(country) ],
              { datasource: variables.dsn }
            );
          }
        }
      }

      queryExecute(
        "UPDATE players SET seen_at = NOW() WHERE id = ?",
        [ strParam(playerId) ],
        { datasource: variables.dsn }
      );

      var myPoints = val(scalar(
        "SELECT COUNT(*) FROM checkins WHERE player_id = ?",
        [ strParam(playerId) ]
      ));
      var ahead = val(scalar(
        "SELECT COUNT(*) FROM (SELECT player_id, COUNT(*) AS n FROM checkins GROUP BY player_id) t WHERE t.n > ?",
        [ intParam(myPoints) ]
      ));
      var playerCount = val(scalar("SELECT COUNT(DISTINCT player_id) FROM checkins"));
      var myRank = 0;
      if (myPoints > 0) myRank = ahead + 1;

      var payload = {
        ok: true,
        today: clock.today,
        handle: scalar("SELECT handle FROM players WHERE id = ?", [ strParam(playerId) ]),
        you: { rank: myRank, points: myPoints, players: playerCount },
        individual: individualBoard(playerId),
        circles: circles(),
        countries: countryBoard()
      };

      var mine = beaconFor(playerId);
      if (!structIsEmpty(mine)) payload.beacon = mine;

      return { status: 200, body: payload };

    } catch (any e) {
      cflog(file = "dailybeacon", type = "error", text = "sync: " & e.message);
      var hint = "The server could not reach its database.";
      var detail = structKeyExists(e, "detail") ? e.detail : "";
      if (findNoCase("doesn't exist", e.message) || findNoCase("doesn't exist", detail)) {
        hint = "The database tables are missing. Open api/install.cfm?run=1 once, then reload.";
      }
      if (findNoCase("unknown column", e.message) || findNoCase("unknown column", detail)) {
        hint = "The tables are out of date. Open api/install.cfm?run=1 once, then reload.";
      }
      return fail(500, hint);
    }
  }

  // ---------------------------------------------------------------------------
  // GET api/ping.cfm - setup check: is the datasource wired to a real schema?
  // ---------------------------------------------------------------------------
  public struct function ping() {
    try {
      var clock = serverClock();
      var tables = scalar(
        "SELECT COUNT(*) FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name IN ('players', 'beacons', 'checkins')"
      );
      return {
        status: 200,
        body: { ok: true, today: clock.today, tables: tables, ready: tables == 3 }
      };
    } catch (any e) {
      return fail(500, "Database not reachable: " & e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // api/install.cfm - creates the tables from db/schema.sql
  // ---------------------------------------------------------------------------
  public struct function install() {
    var report = [];

    try {
      var sql = fileRead(getDirectoryFromPath(getCurrentTemplatePath()) & "../db/schema.sql");

      // Strip comment lines, then run each ; separated statement. The schema has
      // no semicolons inside a statement, so a plain split is enough.
      var kept = [];
      for (var line in listToArray(sql, chr(10), true)) {
        var trimmed = trim(line);
        if (!len(trimmed) || left(trimmed, 2) == "--") continue;
        arrayAppend(kept, trimmed);
      }

      var count = 0;
      for (var statement in listToArray(arrayToList(kept, chr(10)), ";", true)) {
        var clean = trim(statement);
        if (!len(clean)) continue;
        queryExecute(clean, [], { datasource: variables.dsn });
        count++;
      }

      arrayAppend(report, "Ran " & count & " statement(s) against the datasource '" & variables.dsn & "'.");
      arrayAppend(report, "players:  " & scalar("SELECT COUNT(*) FROM players"));
      arrayAppend(report, "beacons:  " & scalar("SELECT COUNT(*) FROM beacons"));
      arrayAppend(report, "checkins: " & scalar("SELECT COUNT(*) FROM checkins"));
      arrayAppend(report, "Database date: " & scalar("SELECT CURDATE()"));

      return { ok: true, report: report };

    } catch (any e) {
      arrayAppend(report, "FAILED: " & e.message);
      arrayAppend(report, "Check the datasource name in api/lib.cfc and that the database user can create tables.");
      return { ok: false, report: report };
    }
  }

  // ---------------------------------------------------------------------------
  // Players
  // ---------------------------------------------------------------------------

  // The token is a long random string the browser makes and keeps. Only its hash
  // is stored, so a copy of the table cannot be replayed as anybody.
  private string function ensurePlayer(required string token) {
    var tokenHash = lcase(hash(arguments.token, "SHA-256"));
    var found = scalar("SELECT id FROM players WHERE token_hash = ?", [ strParam(tokenHash) ]);
    if (len(found)) return found;

    var id = createUUID();
    queryExecute(
      "INSERT IGNORE INTO players (id, token_hash, created_at, seen_at) VALUES (?, ?, NOW(), NOW())",
      [ strParam(id), strParam(tokenHash) ],
      { datasource: variables.dsn }
    );

    found = scalar("SELECT id FROM players WHERE token_hash = ?", [ strParam(tokenHash) ]);
    return len(found) ? found : id;
  }

  // The player's beacon plus what the whole circle has done, or an empty struct.
  private struct function beaconFor(required string playerId) {
    var q = queryExecute(
      "SELECT b.name,
              (SELECT COUNT(*) FROM checkins c WHERE c.beacon_id = b.id) AS points,
              (SELECT COUNT(*) FROM checkins c WHERE c.beacon_id = b.id AND c.player_id = ?) AS yours,
              (SELECT COUNT(*) FROM players p WHERE p.beacon_id = b.id) AS members,
              DATE_FORMAT(
                (SELECT MIN(c.day) FROM checkins c WHERE c.beacon_id = b.id AND c.player_id = ?),
                '%Y-%m-%d'
              ) AS since
       FROM beacons b
       JOIN players p ON p.beacon_id = b.id
       WHERE p.id = ?",
      [ strParam(arguments.playerId), strParam(arguments.playerId), strParam(arguments.playerId) ],
      { datasource: variables.dsn }
    );

    if (!q.recordcount) return {};

    return {
      name: q.name[1],
      points: q.points[1],
      yours: q.yours[1],
      members: q.members[1],
      since: len(q.since[1]) ? q.since[1] : ""
    };
  }

  // ---------------------------------------------------------------------------
  // Beacons
  // ---------------------------------------------------------------------------

  // Finds the beacon behind a name, or creates it. Returns { ok, id, name, key }.
  private struct function resolveBeacon(required string name) {
    var check = checkBeacon(arguments.name);
    if (!check.ok) return { ok: false, error: check.error };

    var existing = queryExecute(
      "SELECT id, name, name_key FROM beacons WHERE name_key = ?",
      [ strParam(check.key) ],
      { datasource: variables.dsn }
    );

    if (existing.recordcount) {
      return { ok: true, id: existing.id[1], name: existing.name[1], key: existing.name_key[1] };
    }

    try {
      queryExecute(
        "INSERT INTO beacons (name, name_key, created_at) VALUES (?, ?, NOW())",
        [ strParam(check.name), strParam(check.key) ],
        { datasource: variables.dsn }
      );
    } catch (any e) {
      // Another request created the same key between the select and the insert.
      // The unique index settled it; read the winner below.
    }

    var again = queryExecute(
      "SELECT id, name, name_key FROM beacons WHERE name_key = ?",
      [ strParam(check.key) ],
      { datasource: variables.dsn }
    );
    if (!again.recordcount) return { ok: false, error: "That beacon could not be saved. Try again." };

    return { ok: true, id: again.id[1], name: again.name[1], key: again.name_key[1] };
  }

  // Individual board: named players by check-ins. Names are set through handle,
  // which is separate from the beacon so two people in one circle can be told apart.
  private array function individualBoard(required string playerId) {
    var q = queryExecute(
      "SELECT p.id AS id, p.handle AS handle, COUNT(c.player_id) AS points
       FROM players p
       JOIN checkins c ON c.player_id = p.id
       WHERE p.handle <> ''
       GROUP BY p.id, p.handle
       ORDER BY points DESC, p.handle ASC
       LIMIT 10",
      [],
      { datasource: variables.dsn }
    );

    var out = [];
    for (var i = 1; i <= q.recordcount; i++) {
      var mine = q.id[i] == arguments.playerId;
      arrayAppend(out, {
        handle: q.handle[i],
        points: q.points[i],
        isYou: mine
      });
    }
    return out;
  }

  // Country board. Countries come from the request header the CDN or host adds;
  // we never store an IP address, only the two-letter country it reported.
  private array function countryBoard() {
    var q = queryExecute(
      "SELECT c.country AS code, COUNT(*) AS points, COUNT(DISTINCT c.player_id) AS members
       FROM checkins c
       WHERE c.country <> ''
       GROUP BY c.country
       ORDER BY points DESC, c.country ASC
       LIMIT 10",
      [],
      { datasource: variables.dsn }
    );

    var out = [];
    for (var i = 1; i <= q.recordcount; i++) {
      arrayAppend(out, {
        code: q.code[i],
        points: q.points[i],
        members: q.members[i]
      });
    }
    return out;
  }

  // "US" from CF-IPCountry (Cloudflare) or a similar header. Empty when the host
  // reports nothing, which leaves the country board hidden rather than guessing.
  private string function requestCountry() {
    var headers = {};
    try {
      headers = getHTTPRequestData().headers;
    } catch (any e) {
      return "";
    }

    var names = [ "CF-IPCountry", "X-Country-Code" ];
    for (var name in names) {
      if (!structKeyExists(headers, name)) continue;

      var code = ucase(trim(headers[name]));
      if (!reFind("^[A-Z]{2}$", code)) continue;
      if (listFind("XX,T1,A1,A2,O1", code)) continue;
      return code;
    }

    return "";
  }

  // Top circles: every beacon with its pooled points and how many people hold it.
  private array function circles() {
    var q = queryExecute(
      "SELECT b.name AS name,
              COUNT(c.player_id) AS points,
              (SELECT COUNT(*) FROM players p WHERE p.beacon_id = b.id) AS members
       FROM beacons b
       LEFT JOIN checkins c ON c.beacon_id = b.id
       GROUP BY b.id, b.name
       ORDER BY points DESC, b.name ASC
       LIMIT 10",
      [],
      { datasource: variables.dsn }
    );

    var out = [];
    for (var i = 1; i <= q.recordcount; i++) {
      arrayAppend(out, { name: q.name[i], points: q.points[i], members: q.members[i] });
    }
    return out;
  }

  // Returns { ok: true, name, key } or { ok: false, error }.
  private struct function checkBeacon(required string input) {
    var name = trim(reReplace(arguments.input, "\s+", " ", "all"));

    if (!len(name)) return { ok: false, error: "Give it a name." };
    if (len(name) < variables.beaconMin) return { ok: false, error: "Use at least " & variables.beaconMin & " characters." };
    if (len(name) > variables.beaconMax) return { ok: false, error: "Keep it to " & variables.beaconMax & " characters or fewer." };

    // Letters (including accented ones), digits, spaces, apostrophes, hyphens and full stops.
    var allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '.-";
    for (var i = 1; i <= len(name); i++) {
      var ch = mid(name, i, 1);
      var code = asc(ch);
      var fine = find(ch, allowed) > 0 || (code >= 192 && code <= 591);
      if (!fine) {
        return { ok: false, error: "Letters, numbers, spaces, apostrophes, hyphens and full stops only." };
      }
    }

    if (find(left(name, 1), " '.-") > 0 || find(right(name, 1), " '.-") > 0) {
      return { ok: false, error: "Start and end with a letter or number." };
    }

    var key = beaconKey(name);
    if (!len(key)) return { ok: false, error: "Give it a name." };
    if (isReserved(key)) return { ok: false, error: "That name is reserved. Pick another." };
    if (isBlocked(key)) return { ok: false, error: "That name is not allowed. Pick another." };

    return { ok: true, name: name, key: key };
  }

  // "Captain  Kirk" and "captain kirk" are the same beacon.
  private string function beaconKey(required string name) {
    var value = foldBase(arguments.name);
    value = reReplace(value, "[^a-z0-9]+", " ", "all");
    return trim(reReplace(value, "\s+", " ", "all"));
  }

  // Lowercase, accents removed, curly apostrophes straightened.
  private string function foldBase(required string text) {
    var value = lcase(arguments.text);
    try {
      var normalizer = createObject("java", "java.text.Normalizer");
      var form = createObject("java", "java.text.Normalizer$Form");
      value = normalizer.normalize(value, form.NFD);
      value = value.replaceAll("[" & chr(768) & "-" & chr(879) & "]", "");
    } catch (any e) {
      // Accent folding is a nicety; carry on with the plain lowercase name.
    }
    return replace(value, chr(8217), "'");
  }

  private struct function leetMap() {
    return { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g" };
  }

  private string function leet(required string text) {
    var map = leetMap();
    var out = "";
    for (var i = 1; i <= len(arguments.text); i++) {
      var ch = mid(arguments.text, i, 1);
      out &= structKeyExists(map, ch) ? map[ch] : ch;
    }
    return out;
  }

  private boolean function blockedWord(required string token) {
    if (!len(arguments.token)) return false;
    if (arrayFindNoCase(variables.safeTokens, arguments.token) > 0) return false;
    if (arrayFindNoCase(variables.bannedTokens, arguments.token) > 0) return true;

    for (var stem in variables.bannedStems) {
      if (find(stem, arguments.token) > 0) return true;
    }
    return false;
  }

  private boolean function isReserved(required string key) {
    var forms = [ arguments.key, leet(arguments.key), leet(replace(arguments.key, " ", "", "all")) ];
    for (var form in forms) {
      if (arrayFindNoCase(variables.reserved, form) > 0) return true;
    }
    return false;
  }

  private boolean function isBlocked(required string key) {
    for (var token in listToArray(arguments.key, " ")) {
      if (blockedWord(leet(token))) return true;
    }
    // Letters spaced out one by one only read as a word once the gaps go.
    return blockedWord(leet(replace(arguments.key, " ", "", "all")));
  }

  // ---------------------------------------------------------------------------
  // Plumbing
  // ---------------------------------------------------------------------------

  private struct function readJson() {
    var raw = "";
    try {
      var requestData = getHTTPRequestData();
      if (structKeyExists(requestData, "content") && len(requestData.content)) {
        raw = toString(requestData.content);
      }
    } catch (any e) {
      raw = "";
    }

    if (!len(trim(raw))) return {};

    try {
      var parsed = deserializeJSON(raw);
      if (isStruct(parsed)) return parsed;
    } catch (any e) {
      // Fall through to an empty body; the endpoint says what is missing.
    }
    return {};
  }

  private struct function fail(required numeric status, required string message) {
    return { status: arguments.status, body: { ok: false, error: arguments.message } };
  }

  private any function field(required struct data, required string name) {
    return structKeyExists(arguments.data, arguments.name) ? arguments.data[arguments.name] : "";
  }

  private string function cleanToken(required any value) {
    if (!isSimpleValue(arguments.value)) return "";
    var text = trim(arguments.value);
    if (len(text) < 16 || len(text) > 64) return "";
    if (reFind("[^A-Za-z0-9_-]", text)) return "";
    return text;
  }

  private string function cleanDay(required any value) {
    if (!isSimpleValue(arguments.value)) return "";
    var text = trim(arguments.value);
    return reFind("^[0-9]{4}-[0-9]{2}-[0-9]{2}$", text) ? text : "";
  }

  // Yesterday/today/tomorrow as strings from the database clock. Doing the date
  // maths in SQL keeps one timezone in charge: the database server's.
  private struct function serverClock() {
    var q = queryExecute(
      "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today,
              DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL -1 DAY), '%Y-%m-%d') AS yesterday,
              DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '%Y-%m-%d') AS tomorrow",
      [],
      { datasource: variables.dsn }
    );

    return {
      today: q.today[1],
      yesterday: q.yesterday[1],
      tomorrow: q.tomorrow[1],
      allowed: [ q.yesterday[1], q.today[1], q.tomorrow[1] ]
    };
  }

  private any function scalar(required string sql, array params = []) {
    var q = queryExecute(arguments.sql, arguments.params, { datasource: variables.dsn });
    if (!q.recordcount) return "";
    return q[listFirst(q.columnList)][1];
  }

  private struct function strParam(required any value) {
    return { value: toString(arguments.value), cfsqltype: "cf_sql_varchar" };
  }

  private struct function intParam(required any value) {
    return { value: val(arguments.value), cfsqltype: "cf_sql_integer" };
  }

}
