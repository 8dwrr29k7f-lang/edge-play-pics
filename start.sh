#!/bin/sh
set -e
echo "EDGE PLAY PICS starting..."
echo "Env: TOKEN=${DISCORD_TOKEN:+set} CLIENT=${CLIENT_ID:+set} GUILD=${GUILD_ID:+set} PICS=${PICS_CHANNEL_ID:+set} PORT=${PORT:-auto}"

if [ ! -f src/index.js ]; then
  echo "FATAL: src/index.js missing — repo may be incomplete"
  ls -la . src 2>/dev/null || true
  exit 1
fi

# Optional: still support old zip flow if someone deletes unpacked src
if [ -f src.zip ] && [ ! -f src/index.js ]; then
  node extract.mjs || true
fi

exec node src/index.js
