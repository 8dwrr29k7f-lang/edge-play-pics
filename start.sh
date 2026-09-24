#!/bin/sh
set -e
echo "EDGE PLAY PICS starting..."
echo "Env: TOKEN=${DISCORD_TOKEN:+set} CLIENT=${CLIENT_ID:+set} GUILD=${GUILD_ID:+set} PICS=${PICS_CHANNEL_ID:+set} PORT=${PORT:-auto}"

if [ ! -f src/index.js ] || [ ! -f src/data/desk.js ]; then
  echo "FATAL: incomplete source tree"
  ls -la src src/data 2>/dev/null || true
  exit 1
fi

# ── Overlays ──────────────────────────────────────────────────────────────
# ONLY apply overlays that are still additive / safe.
# Do NOT overwrite analyticsEngine, pickFormat, lotdEmbed, liveEmbeds,
# registerOnBoot, index, or categoryEmbed — those are production sources of truth in src/.
#
# categoryEmbed overlay is intentionally DISABLED: the overlay is an old static
# desk that lacks registryEmbed / async live pipeline and crashes boot.
#
# Safe overlays only:
[ -f overlay_config.js ] && cp -f overlay_config.js src/config.js && echo "Overlay: config"
[ -f overlay_mediaFollow.js ] && cp -f overlay_mediaFollow.js src/mediaFollow.js && echo "Overlay: mediaFollow"

echo "Skip overlay (src is source of truth): analyticsEngine pickFormat lotdEmbed liveEmbeds registerOnBoot categoryEmbed"

# Ensure data dir exists for tracker/state persistence
mkdir -p src/data

echo "Launching node src/index.js"
exec node src/index.js
