# Railway fix for crash after publish

## Cause
Safe start `node src/index.js` fails because `index.js` lives inside **src.zip**, not as a loose file.

## Fix
Start command must be:

```
sh start.sh
```

That script unpacks `src.zip` then runs the bot.

## Variables (exact names)
```
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
PICS_CHANNEL_ID=
SCAN_MINUTES=15
TZ=America/Chicago
```

## After deploy
Logs should show:
```
Unpacking src.zip into src/
Launching node src/index.js
EDGE PLAY PICS online
```

If you still see TOKEN errors, reset the bot token in Discord Developer Portal and paste the new one into Railway Variables.
