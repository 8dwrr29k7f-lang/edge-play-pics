#!/bin/sh
set -e
echo "EDGE PLAY PICS starting..."
if [ ! -f src/index.js ]; then
  if [ -f src.zip ]; then
    echo "Unpacking src.zip into src/"
    unzip -qo src.zip -d src
  else
    echo "FATAL: no src/index.js and no src.zip"
    ls -la
    exit 1
  fi
fi
if [ ! -f src/index.js ]; then
  echo "FATAL: src/index.js still missing after unzip"
  ls -la src || true
  exit 1
fi
echo "Launching node src/index.js"
exec node src/index.js
