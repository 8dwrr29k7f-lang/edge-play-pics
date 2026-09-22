# EDGE PLAY PICS

Discord sports desk bot — daily auto card, Play of the Day, locks/leans/holds, cash-out watch, tracker.

## Railway deploy
1. Connect this repo to Railway
2. Variables: `DISCORD_TOKEN` `CLIENT_ID` `GUILD_ID` `PICS_CHANNEL_ID` `SCAN_MINUTES=15` `TZ=America/Chicago`
3. Start command (already in railway.json):
   `unzip -qo src.zip -d src; node src/index.js`
4. Register slash commands once (local):
   `npm install && node src/register-commands.js`

`src.zip` holds the full bot source. Unzip runs on start so all modules load.

## Local
```bash
unzip -qo src.zip -d src
npm install
node src/register-commands.js
npm start
```

21+ · 1-800-GAMBLER
