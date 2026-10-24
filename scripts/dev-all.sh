#!/usr/bin/env bash
# Local only. Main studio on 3000, durable experiments on 3101, 3102 and 3103, agent app on 3200.
# Each service reads its own ignored .env.local. Ctrl-C stops all of them.
set -uo pipefail
cd "$(dirname "$0")/.."

for d in durable-workflow-v1 durable-workflow-v2 durable-dashboard-v3; do
  [ -d "experiments/$d/node_modules" ] || { echo "Missing deps: cd experiments/$d && npm ci --ignore-scripts"; exit 1; }
done
[ -d agent/node_modules ] || { echo "Missing deps: cd agent && npm ci"; exit 1; }

# Workflow refuses to start over a stale generated build from build:preview.
rm -rf experiments/durable-dashboard-v3/.nitro-build

pids=()
trap 'kill "${pids[@]}" 2>/dev/null; wait' EXIT INT TERM

node --env-file-if-exists=.env.local server.mjs &
pids+=($!)

for d in durable-workflow-v1 durable-workflow-v2 durable-dashboard-v3; do
  (cd "experiments/$d" && set -a && { [ ! -f .env.local ] || . ./.env.local; } && set +a && exec npm run dev --silent -- --host 127.0.0.1) &
  pids+=($!)
done

(cd agent && exec node --env-file-if-exists=../.env.local server.mjs) &
pids+=($!)

wait
