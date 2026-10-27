#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
  if [ ! -x "$runtime/node/bin/node" ]; then echo "Please install Node.js >=22.19" >&2; exit 1; fi
  PATH="$runtime/node/bin:$PATH"; export PATH
fi
exec node --import tsx src/cli.ts "$@"
