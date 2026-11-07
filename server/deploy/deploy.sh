#!/usr/bin/env bash
# Builds and ships the live-link server to `serv` (see ~/.ssh/config) in ~/breezr-live, then (re)starts it
# with pm2. The Caddy block (Caddyfile next to this script) is installed separately, once.
set -euo pipefail
cd "$(dirname "$0")/../.."

bun run build:server
bun run build:web

ssh serv 'mkdir -p ~/breezr-live/public ~/breezr-live/data ~/breezr-live/logs && chmod 700 ~/breezr-live/data'
rsync -a --delete web/dist/ serv:breezr-live/public/
rsync -a server/dist/server.js server/deploy/ecosystem.config.cjs server/deploy/Caddyfile serv:breezr-live/
ssh serv 'cd ~/breezr-live && pm2 startOrReload ecosystem.config.cjs && pm2 save'
