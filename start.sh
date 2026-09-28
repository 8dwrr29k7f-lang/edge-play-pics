#!/bin/sh
set -e
echo "EDGE PLAY PICS starting..."

if [ -f src.zip ]; then
  node extract.mjs || {
    echo "extract failed — fallback"
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

# CRITICAL: full overlays LAST (never let patches strip exports)
[ -f overlay_config.js ] && cp -f overlay_config.js src/config.js && echo "OK config"
[ -f overlay_pickFormat.js ] && cp -f overlay_pickFormat.js src/pickFormat.js && echo "OK pickFormat"
[ -f overlay_lotdEmbed.js ] && cp -f overlay_lotdEmbed.js src/lotdEmbed.js && echo "OK lotdEmbed"
[ -f overlay_liveEmbeds.js ] && cp -f overlay_liveEmbeds.js src/liveEmbeds.js && echo "OK liveEmbeds"
[ -f overlay_analyticsEngine.js ] && cp -f overlay_analyticsEngine.js src/analyticsEngine.js && echo "OK analytics"
[ -f overlay_categoryEmbed.js ] && cp -f overlay_categoryEmbed.js src/categoryEmbed.js && echo "OK categoryEmbed"
[ -f overlay_dailyRoll.js ] && cp -f overlay_dailyRoll.js src/dailyRoll.js && echo "OK dailyRoll (exports restored)"

node --input-type=module -e "
import * as c from './src/config.js';
import * as d from './src/dailyRoll.js';
if (!c.assertConfig) { console.error('FATAL: assertConfig missing'); process.exit(1); }
if (!d.rollDailyCard || !d.ensureTodayCard) {
  console.error('FATAL: dailyRoll missing rollDailyCard/ensureTodayCard', Object.keys(d));
  process.exit(1);
}
console.log('export check OK');
" || exit 1

echo "Env TOKEN=${DISCORD_TOKEN:+set} CLIENT=${CLIENT_ID:+set}"
echo "Launching node src/index.js"
exec node src/index.js
