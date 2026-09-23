# EDGE PLAY PICS v4.4

Discord sports desk bot — **evidence-first daily analytics engine**.

## Process guarantee (never outcomes)

- Daily scan of MLB / NFL / NBA / NHL / NCAAF via public ESPN feeds
- Multi-factor engine: model · edge · data quality · what-if · autopsy
- **LOCK only** when strict thresholds pass — otherwise **LEAN** or **NO PLAY**
- **NO PLAY preferred** over inventing confidence when data is thin
- Last-chance validation gate before any board reaches Discord
- Stale protection (3h) + auto-rescan
- **Auto-grade** wins/losses from ESPN finals for pending ML picks
- Historical tracker (`/logpick` · `/grade`) — records are never rewritten
- Never fabricates odds, injuries, lineups, or results
- Never forces a lock or lean to keep a board full

## Daily workflow (America/Chicago)

| Time | Action |
|------|--------|
| 08:00 | Daily scan → publish board (deduped per calendar day) |
| 12:00 | Pre-game monitor / stale alerts / auto-grade |
| 16:00 | Re-verify + auto-rescan if stale + auto-grade |
| 20:00 | Evening review |
| every `SCAN_MINUTES` | Light reverify + auto-grade finals |

## Commands

| Command | Purpose |
|---------|---------|
| `/help` | Command menu |
| `/daily` `/card` `/roll` | Today’s evidence board |
| `/scan` | Force full rescan |
| `/lotd` `/locks` `/best` `/live` | Process cards |
| `/status` | Component health (Discord · ESPN · engine · storage · scheduler) |
| `/track` `/pending` `/logpick` `/grade` `/review` `/learn` | Ledger |
| `/lean` `/hold` `/media` `/hedge` `/limits` `/scores` | Desk utilities |
| `/mlb` `/nfl` … | Sport desks |

## Railway deploy

1. Connect this repo to Railway
2. **Variables:** `DISCORD_TOKEN` · `CLIENT_ID` · `GUILD_ID` · `PICS_CHANNEL_ID` · `SCAN_MINUTES=15` · `TZ=America/Chicago`
3. Optional: `EDGE_PLAY_API` for a live odds backend
4. **Start:** `sh start.sh` (see `railway.json`)
5. Attach a **volume** to `src/data` so tracker/state survive restarts
6. Slash commands register on boot when `CLIENT_ID` (+ optional `GUILD_ID`) are set

`src/` is the source of truth. Boot only applies safe overlays (`config`, `mediaFollow`, `categoryEmbed`) — engine/handlers are **not** overwritten.

## Architecture

```
SCAN (ESPN)
  → ANALYZE (analyticsEngine multi-stage)
  → FILTER (LOCK / LEAN / NO PLAY)
  → VALIDATE (validatePublish gate)
  → PUBLISH (Discord + desk memory)
  → MONITOR (reverify / stale / auto-rescan)
  → AUTO-GRADE (ESPN finals → tracker)
  → TRACK (/logpick · /grade · /review)
```

## Health

`/status` probes: Discord · ESPN · odds API · engine gates · storage · scheduler.

21+ · 1-800-GAMBLER
