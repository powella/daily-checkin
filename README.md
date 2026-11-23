# Daily — one point a day

A one-page daily check-in app built around **beacons**. Press the button once a
day to keep a streak; every check-in also adds a point to the beacon you hold,
and everyone holding the same beacon pools their points into a **circle**.
Boards rank individuals, circles and countries.

## What's here

| Path | What it is |
| --- | --- |
| `index.html`, `app.js`, `scoring.js` | The app — one page, no build step, no dependencies |
| `api/` | The small ColdFusion API the shared boards use |
| `db/schema.sql` | MariaDB tables for players, beacons and check-ins |
| `DEPLOY.md` | Hostek setup: datasource, tables, country header |

## Running it locally

```
python3 -m http.server 3001
```

Open <http://localhost:3001>. Everything except the boards works without the
API: the boards card shows "not connected" and the score, streak, beacon and
tap tally stay on the device.

## How it works

- **Score and streak are local.** One check-in a day scores, with a multiplier
  that grows with the streak (×1 → ×3). Extra presses the same day change
  nothing except the lifetime tap tally.
- **The server only counts days.** `POST api/sync.cfm` takes an anonymous
  128-bit player key (only its SHA-256 is stored), records at most one check-in
  per player per day, and reports the player's beacon, their standing and the
  three boards.
- **A beacon is a shared name, not an account.** Two people who pick `Columbia`
  are in the same circle, and the circle's points are the sum of its members'
  check-ins. Names are screened on both sides; the server copy is what counts.
- **Countries are reported, not guessed.** The API reads
  `CF-IPCountry` (Cloudflare) or `X-Country-Code` and stores only the two-letter
  code — never an IP address. No header, no country board.
- **Sync codes** move the player key, score, streak and beacon to another
  device; the code merges rather than replaces, so points are never lost.

## Deploying

See [DEPLOY.md](DEPLOY.md). In short: create a MariaDB database, add a
ColdFusion datasource named `dailyCheckInApp`, upload the files, open
`api/install.cfm?run=1` once, check `api/ping.cfm`, then delete the installer.

The shared board is casual rather than tamper-proof: there is no sign-in, so a
fresh key can claim today's point. Keeping it friendly is the point.
