# Redeploy checklist (v4.6)

After latest `main` lands (feeds module + 8-sport daily scan + selftest):

## 1. Railway → Redeploy
- Open the EDGE PLAY PICS service in Railway
- Click **Deploy** / **Redeploy** (or wait for auto-deploy from GitHub push)
- Confirm start command is still: `sh start.sh`

## 2. Env vars (required)
```
DISCORD_TOKEN=...
CLIENT_ID=...
GUILD_ID=...          # recommended for instant slash registration
PICS_CHANNEL_ID=...
SCAN_MINUTES=15
TZ=America/Chicago
```

## 3. Optional odds backend
```
EDGE_PLAY_API=https://your-odds-backend.example.com
```
When unset, the bot runs in **ESPN-only** mode (fully functional).
When set, `/status` probes the backend and category pipeline can use media/odds enrichment.

Expected endpoints (all soft-fail):
- `GET /health`
- `GET /api/best-bets`
- `GET /api/odds?eventId=`
- `GET /api/media`
- `POST /api/refresh-data`

## 4. Volume (persistence)
Attach a volume at `src/data` so `tracker.json` and `dailyState.json` survive restarts.

## 5. Boot logs to expect
```
EDGE PLAY PICS starting...
Skip overlay (src is source of truth): analyticsEngine pickFormat ...
Health listener on :PORT
Logged in as YourBot#....
scheduler armed · reverify every 15m
[boot] health:
🟢 Discord — connected
🟢 Sports data (ESPN) — N events
⚪ Odds API — not configured (ESPN-only mode)   # or 🟢 if EDGE_PLAY_API set
🟢 Prediction engine — odds math + NO PLAY policy OK
🟢 Storage — writable
🟢 Scheduler — cron + interval armed
```

## 6. Discord smoke test
1. `/status` — component health
2. `/daily` or `/scan` — 8-sport board or NO VERIFIED PICK
3. `/mlb` `/nfl` `/nba` … — per-category desks
4. `/registry` — category map
5. `/track` `/pending` — ledger

## 7. Local self-test (optional)
```bash
npm test
```
