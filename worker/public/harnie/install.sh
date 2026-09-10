#!/bin/sh

set -eu

HARNIE_VERSION="0.1.0-rc.7"
HARNIE_RELEASE_BASE="https://boringinfra.company/harnie/releases/v${HARNIE_VERSION}"
HARNIE_ARCHIVE="harnie-${HARNIE_VERSION}.tgz"
HARNIE_CHECKSUM="${HARNIE_ARCHIVE}.sha256"

fail() {
  printf 'harnie installer: %s\n' "$*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v node >/dev/null 2>&1 || fail "Node.js 22.23 or newer in the Node 22 release line is required"
command -v npm >/dev/null 2>&1 || fail "npm is required"

NODE_VERSION="$(node -p 'process.versions.node')" || fail "could not determine the Node.js version"
OLD_IFS="$IFS"
IFS=.
set -- $NODE_VERSION
IFS="$OLD_IFS"
NODE_MAJOR="${1:-0}"
NODE_MINOR="${2:-0}"

case "$NODE_MAJOR:$NODE_MINOR" in
  22:*)
    [ "$NODE_MINOR" -ge 23 ] 2>/dev/null || fail "Node.js 22.23 or newer is required; found ${NODE_VERSION}"
    ;;
  *)
    fail "Node.js 22.23 or newer in the Node 22 release line is required; found ${NODE_VERSION}"
    ;;
esac

INSTALL_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t harnie-install)" || fail "could not create a temporary directory"
cleanup() {
  rm -rf "$INSTALL_DIR"
}
trap cleanup EXIT HUP INT TERM

printf 'Downloading Harnie %s...\n' "$HARNIE_VERSION"
curl -fsSL "${HARNIE_RELEASE_BASE}/${HARNIE_ARCHIVE}" -o "${INSTALL_DIR}/${HARNIE_ARCHIVE}"
curl -fsSL "${HARNIE_RELEASE_BASE}/${HARNIE_CHECKSUM}" -o "${INSTALL_DIR}/${HARNIE_CHECKSUM}"

(
  cd "$INSTALL_DIR"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "$HARNIE_CHECKSUM"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c "$HARNIE_CHECKSUM"
  else
    fail "sha256sum or shasum is required to verify the download"
  fi
)

npm install --global "${INSTALL_DIR}/${HARNIE_ARCHIVE}"

command -v harnie >/dev/null 2>&1 || fail "npm installed Harnie, but harnie is not on PATH"
INSTALLED_VERSION="$(harnie --version)" || fail "Harnie was installed but could not be run"
[ "$INSTALLED_VERSION" = "harnie ${HARNIE_VERSION}" ] || fail "expected harnie ${HARNIE_VERSION}, found ${INSTALLED_VERSION}"

printf '\nHarnie %s installed successfully.\n' "$HARNIE_VERSION"
printf 'Run `harnie init` to create your local store.\n'
