#!/bin/sh

set -eu

HARNIE_VERSION="0.1.0-rc.7"
HARNIE_TAG="v${HARNIE_VERSION}"
HARNIE_ARCHIVE="harnie-${HARNIE_VERSION}.tgz"
HARNIE_CHECKSUM="${HARNIE_ARCHIVE}.sha256"
HARNIE_RELEASE_DIR="worker/public/harnie/releases/${HARNIE_TAG}"

fail() {
  printf 'prepare installer assets: %s\n' "$*" >&2
  exit 1
}

command -v gh >/dev/null 2>&1 || fail "the GitHub CLI is required"
gh auth status >/dev/null 2>&1 || fail "the GitHub CLI is not authenticated"

mkdir -p "$HARNIE_RELEASE_DIR"
gh release download "$HARNIE_TAG" \
  --repo BoringInfraCo/Harnie \
  --pattern "$HARNIE_ARCHIVE" \
  --pattern "$HARNIE_CHECKSUM" \
  --dir "$HARNIE_RELEASE_DIR" \
  --clobber

(
  cd "$HARNIE_RELEASE_DIR"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "$HARNIE_CHECKSUM"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c "$HARNIE_CHECKSUM"
  else
    fail "sha256sum or shasum is required to verify the release asset"
  fi
)
