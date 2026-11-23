# Putting the shared circles on Hostek

The app is still one static page plus a tiny ColdFusion API. The page works on
its own; the API is only there so check-ins can pool under a beacon.

Stack assumed: ColdFusion 2023 on Windows Server 2022, MariaDB 10.6.

## 1. Database

In the Hostek panel, create a database and a user that can use it, and note the
database name, user and password. Everything lives in `db/schema.sql`.

## 2. ColdFusion datasource

ColdFusion Administrator → **Data & Services → Data Sources → Add New**:

- Name: `dailybeacon` (must match `variables.dsn` at the top of `api/lib.cfc`)
- Driver: MySQL / MariaDB
- Server: `localhost` (or the host Hostek gave you), port `3306`
- Database, user, password: from step 1

Verify it in the administrator before going on.

## 3. Upload

Copy to the site's web root, keeping the structure:

```
index.html
app.js
scoring.js
Application.cfc
api/lib.cfc
api/sync.cfm
api/ping.cfm
api/install.cfm      (delete after step 5)
db/schema.sql
```

No build step, no dependencies.

## 4. Create the tables

Open `https://your-domain/api/install.cfm?run=1`. It runs `db/schema.sql` and
prints the row counts. Run it again after every upgrade: the installer also adds
the new columns (`players.handle`, `checkins.country`) to a database that already
has the older tables. Then open `https://your-domain/api/ping.cfm` — it should
answer:

```
{"ok":true,"today":"2026-11-23","tables":3,"ready":true}
```

If it does not, the datasource name or credentials are the usual cause. The
installer also works when you paste `db/schema.sql` into phpMyAdmin instead.

## 5. Finish

Delete `api/install.cfm`. Open the site, set a beacon, check in. The beacon card
should switch to pooled totals and the Circles card should list the beacon.

## Boards

There are three boards, all counting the same thing: check-ins.

- **Individuals** — players who set a board name, ranked by their own check-ins.
  Players without a name are still ranked in the `you` line but are not listed.
- **Circles** — beacons, ranked by every member's check-ins pooled together.
- **Countries** — check-ins per country. Empty until a country is reported.

### Turning on the country board

The app never stores an IP address. It reads a two-letter country from the
request headers and keeps only that code (on the check-in row). In order of
preference:

1. `CF-IPCountry` — sent automatically when the domain is proxied through
   Cloudflare (free plan is enough). This is the reliable route: the header comes
   from Cloudflare's edge, not from the visitor.
2. `X-Country-Code` — if Hostek or another proxy already adds one.

Without one of those the country board stays hidden and the Countries tab says so.
There is no GeoIP database installed, so the server does not guess from
`REMOTE_ADDR`. Do not enable a header you cannot trust on a directly reachable
origin: a visitor can send it themselves.

## How it works

- The browser makes a random 128-bit player key on first run and keeps it in
  `localStorage`. The server stores only its SHA-256 hash.
- `POST api/sync.cfm` with `{token, beacon?, handle?, day?, checkin?}` returns the
  player's beacon, their standing (`you`) and the three boards.
- `handle` is the name on the individual board. It is separate from the beacon so
  two people in one circle can be told apart; empty clears it.
- One row per player per day in `checkins`, keyed `(player_id, day)`, so repeat
  clicks cost nothing and the client cannot send a score.
- A check-in is only accepted for yesterday, today or tomorrow by the database
  clock. That absorbs timezone edges without letting anyone invent a history.
- Beacon totals are the number of check-in rows credited to the beacon; a member
  count and a today count come along for the board.
- The player's own score, multiplier and streak are still computed in
  `scoring.js`. Nothing about them is stored server-side.

## Things worth knowing

- **Names are shared, not owned.** Two people who pick `Columbia` are in the
  same circle. That is the intended model, but it means there is no invite step
  and anyone can join a circle by typing its name.
- **Beacon screens are duplicated.** `scoring.js` checks names for a friendly
  message; `api/lib.cfc` checks them again because the browser can be bypassed.
  Keep the two word lists in step.
- **The board is casual, not tamper-proof.** Anyone can call the endpoint with a
  fresh token and claim today's point. A real defence needs sign-in, which this
  app deliberately does not have.
- **A sync code is a credential.** It now carries the player key, so treat it
  like a password.
- **Dates follow the database server.** `CURDATE()` decides "today"; set the
  MariaDB `time_zone` if you want a particular zone instead of the host's.
- **Board names are screened like beacons.** The handle goes through the same
  `checkBeacon()` rules in `api/lib.cfc`; an empty name is allowed and means
  "not listed".
- **Country is self-reported by the proxy.** Behind Cloudflare it is reliable;
  without a proxy the column stays empty rather than guessing.
