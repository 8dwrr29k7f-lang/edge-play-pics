#!/bin/sh
set -e
echo "EDGE PLAY PICS starting..."
node extract.mjs
node patch-register.mjs
echo "Launching node src/index.js"
exec node src/index.js
