#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"

PREFIX="$(mktemp -d)"
cleanup() {
  rm -rf "$PREFIX"
}
trap cleanup EXIT HUP INT TERM

export npm_config_prefix="$PREFIX"
export PATH="$PREFIX/bin:$PATH"

curl -fsSL https://boringinfra.company/harnie/install.sh | sh

ACTUAL="$(harnie --version)"
EXPECTED="harnie ${VERSION}"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  printf 'installer smoke: expected %s, found %s\n' "$EXPECTED" "$ACTUAL" >&2
  exit 1
fi

printf 'installer smoke passed: %s\n' "$ACTUAL"
