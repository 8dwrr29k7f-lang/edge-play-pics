# Picks not showing — checklist

Bot online does not equal picks in the channel. You need all of these:

1. **PICS_CHANNEL_ID** = channel ID where picks should post
2. Bot can **View Channel + Send Messages + Embed Links** in that channel
3. Slash commands registered once with the live token:
   `node src/register-commands.js`
4. Force today in Discord: `/daily` then `/live` then `/media` then `/lotd`
5. Auto schedule: **7:00 AM America/Chicago** morning desk + media map

If slash commands do not appear, register-commands was never run.
