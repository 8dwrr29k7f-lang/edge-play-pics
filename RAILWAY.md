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

## Why it used to crash
1. **Missing DISCORD_TOKEN** → process exits immediately (assertConfig).
2. **No open port** → Railway web services expect something listening on `$PORT`. Discord bots don't, so the platform can restart/kill the process. Fixed: a tiny HTTP health server now listens on PORT.
3. **Runtime zip extract** was fragile; source is now unpacked in the repo.

## Good boot logs
```
EDGE PLAY PICS starting...
Env: TOKEN=set CLIENT=set ...
Health listener on :XXXX
Logged in as YourBot#1234
```

## After deploy
- Redeploy in Railway dashboard.
- Check logs for the lines above.
- In Discord: `/daily` then `/locks` then `/lotd`.
