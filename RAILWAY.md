# Railway deploy (EDGE PLAY PICS)

## Start command
```
sh start.sh
```
(Already set in `railway.json`.)

## Required Variables
```
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_server_id
PICS_CHANNEL_ID=channel_for_auto_posts
SCAN_MINUTES=15
TZ=America/Chicago
```

Optional: `EDGE_PLAY_API`, `KBO_CHANNEL_ID`, `PORT` (Railway sets PORT automatically).

## Why deploys used to fail / crash
1. **Broken src.zip** (tiny empty zip) → extract step failed. **Removed** — `src/` is now the source of truth in the repo.
2. **Missing DISCORD_TOKEN** → process exits immediately (assertConfig).
3. **No open port** → Railway web services expect something listening on `$PORT`. Discord bots don't, so the platform can restart/kill the process. Fixed: a tiny HTTP health server now listens on PORT.

## Good boot logs
```
EDGE PLAY PICS starting...
Skip overlay (src is source of truth): analyticsEngine pickFormat ...
export check OK
Env TOKEN=set CLIENT=set
Launching node src/index.js
Health listener on :XXXX
Logged in as YourBot#1234
```

## After deploy
- Redeploy in Railway dashboard (or push will auto-deploy if connected).
- Check logs for the lines above.
- In Discord: `/status` then `/daily` then `/locks`.

## Volume (recommended)
Attach a volume at `src/data` so `tracker.json` / daily state survive restarts.
