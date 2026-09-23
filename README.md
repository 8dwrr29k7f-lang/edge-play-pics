# EDGE PLAY PICS

Discord sports desk bot — **Daily Sports Analytics Engine**.

## Process guarantee (never outcomes)

- ✅ Daily scanning of MLB / NFL / NBA / NHL / NCAAF via public ESPN feeds
- ✅ Multi-factor evidence engine (model · edge · data quality · autopsy)
- ✅ LOCK only when strict thresholds pass — otherwise LEAN or **NO PLAY**
- ✅ Automatic monitoring + stale protection
- ✅ Transparent Discord board format
- ✅ Historical tracker (no rewritten results)
- ❌ Never fabricates odds, injuries, lineups, or results
- ❌ Never forces a lock to keep a streak

## Daily workflow (America/Chicago)

| Time | Action |
|------|--------|
| 08:00 | 🌅 Daily scan → publish board |
| 12:00 | 🔄 Pre-game monitor / alerts |
| 16:00 | 🔄 Re-verify + stale check |
| 20:00 | 🌆 Evening review |
| every SCAN_MINUTES | Light reverify |

## Commands

- `/daily` or `/card` — run/ensure today’s board
- `/scan` — force full rescan
- `/lotd` / `/locks` / `/best` — evidence cards
- `/status` — engine + tracker summary
- `/track` `/review` `/pending` `/learn`

## Railway deploy

1. Connect this repo to Railway
2. Variables: `DISCORD_TOKEN` `CLIENT_ID` `GUILD_ID` `PICS_CHANNEL_ID` `SCAN_MINUTES=15` `TZ=America/Chicago`
3. Start: `sh start.sh` (or railway.json)
4. Register slash commands once (local):
   `npm install && node src/register-commands.js`

Overlays in repo root are copied onto `src/` at boot so the evidence engine and pick format stay current.

## Architecture

```
SCAN (ESPN) → ANALYZE (analyticsEngine) → FILTER (LOCK/LEAN/NO PLAY)
→ PUBLISH (Discord board) → MONITOR (reverify/stale) → UPDATE / REMOVE
→ REVIEW → TRACKER LEARN
```

21+ · 1-800-GAMBLER
