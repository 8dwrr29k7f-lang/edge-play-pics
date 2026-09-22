# Railway

1. New Project → Deploy from GitHub → `edge-play-pics`
2. Variables:
```
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
PICS_CHANNEL_ID=
SCAN_MINUTES=15
TZ=America/Chicago
```
3. Start: `unzip -qo src.zip -d src; node src/index.js`
4. Logs should show: `EDGE PLAY PICS online`
5. In Discord: `/status` `/daily` `/lotd`

Register commands once from any machine with Node + same env:
`node src/register-commands.js`
