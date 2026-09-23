# Redeploy checklist (v4.3)

After pulling latest `main`:

1. **Railway → Redeploy** this service
2. Confirm env vars:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID` (recommended)
   - `PICS_CHANNEL_ID`
   - `SCAN_MINUTES=15`
   - `TZ=America/Chicago`
3. Logs should show:
   - `EDGE PLAY PICS starting...`
   - `Skip overlay (src is source of truth): analyticsEngine...`
   - `Logged in as ...`
   - `scheduler armed`
   - `[boot] health:` with green/red component lines
4. In Discord, run in order:
   - `/status` — expect component health lines
   - `/daily` — evidence board or NO PLAY
   - `/lotd` · `/locks` · `/track`

You do **not** need OpticOdds for the ESPN evidence board.
Optional `EDGE_PLAY_API` only enables the odds backend probe.

Attach a volume on `src/data` if you want tracker history to persist across redeploys.
