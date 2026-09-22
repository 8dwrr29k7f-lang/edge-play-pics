#!/bin/sh
set -e
echo "EDGE PLAY PICS starting..."

if [ -f src.zip ]; then
  node extract.mjs || {
    echo "extract failed — unzip/python fallback"
    mkdir -p src
    unzip -qo src.zip -d src 2>/dev/null || python3 -c "import zipfile; zipfile.ZipFile('src.zip').extractall('src')" 2>/dev/null || true
  }
fi

if [ ! -f src/index.js ]; then
  echo "FATAL: src/index.js missing"
  ls -la . src 2>/dev/null || true
  exit 1
fi

node patch-register.mjs || echo "WARN: patch-register"
node overlay_takes_patch.mjs || echo "WARN: takes"
node overlay_names_patch.mjs || echo "WARN: names"

# Overlays LAST so they always win over zip contents
[ -f overlay_config.js ] && cp overlay_config.js src/config.js && echo "Copied config (with assertConfig)"
[ -f overlay_pickFormat.js ] && cp overlay_pickFormat.js src/pickFormat.js && echo "Copied pickFormat"
[ -f overlay_lotdEmbed.js ] && cp overlay_lotdEmbed.js src/lotdEmbed.js && echo "Copied lotdEmbed"
[ -f overlay_liveEmbeds.js ] && cp overlay_liveEmbeds.js src/liveEmbeds.js && echo "Copied liveEmbeds"
[ -f overlay_analyticsEngine.js ] && cp overlay_analyticsEngine.js src/analyticsEngine.js && echo "Copied analyticsEngine"
[ -f overlay_dailyRoll.js ] && cp overlay_dailyRoll.js src/dailyRoll.js && echo "Copied dailyRoll"

# Quick export sanity
node -e "import('./src/config.js').then(m=>{if(!m.assertConfig){console.error('assertConfig missing');process.exit(1)};console.log('config exports OK')})" || exit 1

echo "Env: TOKEN=${DISCORD_TOKEN:+set} CLIENT=${CLIENT_ID:+set}"
echo "Launching node src/index.js"
exec node src/index.js
