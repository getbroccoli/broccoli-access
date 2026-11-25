#!/bin/sh
# Starts this checkout's source with hot reload. By default it uses fake apps on free ports;
# --real uses real Google and connectors on port 8081. HOST_WEB_PORT overrides either.
# Successful startup is quiet; failures print their output. Any exit removes the containers;
# the database volume stays unless --drop-db removes it before the start.
set -eu
cd "$(dirname "$0")/../.."

real=false
drop_db=false
for option in "$@"; do
  case "$option" in
    --real) real=true ;;
    --drop-db) drop_db=true ;;
    *) echo "Usage: pnpm dev [--real] [--drop-db]" >&2; exit 2 ;;
  esac
done

HOST_UID=$(id -u)
HOST_GID=$(id -g)
# prune.mjs removes this stack once the checkout is gone.
BROCCOLI_ACCESS_CHECKOUT=$PWD
export HOST_UID HOST_GID BROCCOLI_ACCESS_CHECKOUT

# Worktrees share a folder name; Compose must not share their containers or database.
project="broccoli-access-dev-$(node -p "require('node:crypto').createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12)")"
# Never connect the fake workspace's stored credentials or accounts to real apps.
if [ "$real" = true ]; then project="$project-real"; fi

compose() {
  if [ "$real" = true ]; then set -- -f packages/scripts/docker-compose.real.yml "$@"; fi
  docker compose --project-name "$project" -f docker-compose.yml -f packages/scripts/docker-compose.dev.yml "$@"
}

quiet() {
  output=$("$@" 2>&1) || {
    status=$?
    printf '%s\n' "$output" >&2
    return "$status"
  }
}

# The fake Google needs both host ports when it starts, for its consent page and the app's
# redirect address, so they are picked here, not by Compose. A port the shell or .env sets wins.
# shortcut: a program that takes a picked port before `compose up` binds it fails the start; rerun.
# Settings from the base file only: the dev file needs these ports to interpolate.
environment=$(docker compose -f docker-compose.yml config --environment)
free_ports=$(node -e '
  const net = require("node:net");
  const listen = (then) => { const server = net.createServer().listen(0, "127.0.0.1", () => then(server)); };
  listen((a) => listen((b) => { console.log(a.address().port, b.address().port); a.close(); b.close(); }));
')
HOST_WEB_PORT=$(printf '%s\n' "$environment" | sed -n 's/^HOST_WEB_PORT=//p')
HOST_FAKE_GOOGLE_PORT=$(printf '%s\n' "$environment" | sed -n 's/^HOST_FAKE_GOOGLE_PORT=//p')
# A stable real-mode origin keeps saved Google callbacks valid across restarts.
if [ "$real" = true ] && [ -z "$HOST_WEB_PORT" ]; then HOST_WEB_PORT=8081; fi
if [ "${HOST_WEB_PORT:-0}" = 0 ]; then HOST_WEB_PORT=${free_ports% *}; fi
if [ "${HOST_FAKE_GOOGLE_PORT:-0}" = 0 ]; then HOST_FAKE_GOOGLE_PORT=${free_ports#* }; fi
export HOST_WEB_PORT HOST_FAKE_GOOGLE_PORT

if [ "$drop_db" = true ]; then
  # Only this checkout and mode's database volume; keep secrets and the other mode's data.
  database=$(docker volume ls --quiet --filter "label=org.getbroccoli.access.checkout=$PWD" \
    --filter "label=com.docker.compose.project=$project" \
    --filter label=com.docker.compose.volume=dev-postgres-data)
  quiet compose down
  if [ -n "$database" ]; then quiet docker volume rm $database; fi
fi

# The containers run on the checkout's node_modules.
quiet pnpm install --frozen-lockfile
# A reused checkout can skip postinstall and keep GraphQL generated for another commit.
quiet pnpm codegen
# The web app's dev server zips this build for owners to download.
quiet pnpm --filter @broccoli-access/extension build

trap 'quiet compose down' EXIT
# Ctrl-C is the normal way to stop. sh skips the EXIT trap when a signal kills it, so turn
# signals into an exit; HUP comes from a closed terminal.
trap 'exit 0' HUP INT TERM

# Reuse cached images; update them explicitly when needed.
quiet compose up --detach --wait --pull missing
if [ "$real" = false ]; then
  quiet compose exec -T api node_modules/.bin/tsx src/configureDevelopmentMail.ts "http://localhost:$HOST_WEB_PORT"
fi
green='' cyan='' reset=''
if [ -t 1 ]; then
  green='\033[1;32m'
  cyan='\033[1;36m'
  reset='\033[0m'
fi
printf '\n%b🥦🥦🥦  Broccoli Access is ready!%b    ➜  %bhttp://localhost:%s%b\n' \
  "$green" "$reset" "$cyan" "$HOST_WEB_PORT" "$reset"
if [ "$real" = false ]; then
  mailpit=$(compose port mailpit 8025)
  fake_connectors=$(compose port fake-connectors 4000)
  printf '%b📬  Email it sends (Mailpit)%b  ➜  %bhttp://localhost:%s%b\n' \
    "$green" "$reset" "$cyan" "${mailpit##*:}" "$reset"
  printf '%b🔑  Fake Google (Acme)%b        ➜  %bhttp://localhost:%s%b\n' \
    "$green" "$reset" "$cyan" "$HOST_FAKE_GOOGLE_PORT" "$reset"
  # Chrome sends *.localhost to this machine; the Slack cookie stays off the app's own localhost.
  printf '%b🔌  Fake connectors (Acme)%b    ➜  %bhttp://slack.localhost:%s/slack/signin%b\n\n' \
    "$green" "$reset" "$cyan" "${fake_connectors##*:}" "$reset"
fi
compose logs --follow --tail 0
