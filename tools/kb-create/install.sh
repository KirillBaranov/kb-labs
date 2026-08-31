#!/bin/sh
# KB Labs launcher installer.
#
# This script speaks the release control-plane descriptor protocol:
#
#   channel pointer  ->  immutable release descriptor  ->  launcher artifact
#
# Every hop is digest-verified before the next one is read. Documents address
# artifacts as base-relative paths plus SHA-256, never as absolute URLs, so the
# base below is the single thing that changes if hosting moves; already
# published descriptors stay valid.
#
# There is no fallback to an older resolution format. A document published
# before the cutover is rejected on its schema with a typed error.
set -eu

BINARY="kb-create"
DEST="${KB_CREATE_DEST:-${HOME}/.local/bin/${BINARY}}"
RELEASE_BASE="${KB_CREATE_RELEASE_BASE:-https://releases.kb-labs.dev}"
CHANNEL="stable"
RELEASE_ID=""
START_TS="$(date +%s)"

# Colors are enabled only for interactive terminals and when NO_COLOR is unset.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET="$(printf '\033[0m')"
  C_BOLD="$(printf '\033[1m')"
  C_DIM="$(printf '\033[2m')"
  C_CYAN="$(printf '\033[36m')"
  C_GREEN="$(printf '\033[32m')"
  C_YELLOW="$(printf '\033[33m')"
  C_RED="$(printf '\033[31m')"
else
  C_RESET=""
  C_BOLD=""
  C_DIM=""
  C_CYAN=""
  C_GREEN=""
  C_YELLOW=""
  C_RED=""
fi

info() { printf "%s[INFO]%s %s\n" "$C_CYAN" "$C_RESET" "$1"; }
ok() { printf "%s[ OK ]%s %s\n" "$C_GREEN" "$C_RESET" "$1"; }
warn() { printf "%s[WARN]%s %s\n" "$C_YELLOW" "$C_RESET" "$1"; }

# fail prints the same typed diagnostic vocabulary the launcher uses, so a
# bootstrap failure and a launcher failure are triaged from one taxonomy.
fail() {
  printf "%s[ERR ]%s %s: %s\n" "$C_RED" "$C_RESET" "$1" "$2" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: install.sh [--channel <stable|canary|experimental>] [--release <releaseId>]
                  [--release-base <url>] [--dest <path>]

Options:
  --channel <name>      Channel to resolve (default: stable)
  --release <releaseId> Install an exact release instead of following a channel
  --release-base <url>  Trusted release endpoint (default: https://releases.kb-labs.dev)
  --dest <path>         Install location (default: ~/.local/bin/kb-create)
  -h, --help            Show this help

Supported targets: linux/amd64, linux/arm64, darwin/amd64, darwin/arm64.
Windows is not supported.
EOF
}

print_banner() {
  cat <<'EOF'
  _    _  ____    _          _
 | | _| || __ )  | |    __ _| |__  ___
 | |/ / ||  _ \  | |   / _` | '_ \/ __|
 |   <| || |_) | | |__| (_| | |_) \__ \
 |_|\_\_||____/  |_____\__,_|_.__/|___/

EOF
  printf "%sKB Labs Launcher installer%s\n" "$C_BOLD" "$C_RESET"
  echo ""
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --channel)
      shift
      [ "$#" -gt 0 ] || fail KB_CREATE_INPUT_REQUIRED "--channel requires a value"
      CHANNEL="$1"
      ;;
    --release)
      shift
      [ "$#" -gt 0 ] || fail KB_CREATE_INPUT_REQUIRED "--release requires a release ID"
      RELEASE_ID="$1"
      ;;
    --release-base)
      shift
      [ "$#" -gt 0 ] || fail KB_CREATE_INPUT_REQUIRED "--release-base requires a URL"
      RELEASE_BASE="$1"
      ;;
    --dest)
      shift
      [ "$#" -gt 0 ] || fail KB_CREATE_INPUT_REQUIRED "--dest requires a path"
      DEST="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail KB_CREATE_INPUT_REQUIRED "unknown argument: $1"
      ;;
  esac
  shift
done

command -v curl >/dev/null 2>&1 || fail KB_CREATE_INPUT_REQUIRED "curl is required but not found in PATH"

RELEASE_BASE="${RELEASE_BASE%/}"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac

# The supported matrix is four targets. Anything else fails here with the same
# typed code the launcher emits, rather than downloading an artifact that does
# not exist.
case "${OS}/${ARCH}" in
  linux/amd64|linux/arm64|darwin/amd64|darwin/arm64) ;;
  *)
    fail KB_CREATE_RELEASE_TARGET_UNSUPPORTED \
      "${OS}/${ARCH} is outside the supported matrix (linux/amd64, linux/arm64, darwin/amd64, darwin/arm64)"
    ;;
esac

case "$CHANNEL" in
  stable|canary|experimental) ;;
  *) fail KB_CREATE_RELEASE_CHANNEL_ABSENT "unsupported channel: $CHANNEL" ;;
esac

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

# json_string extracts one top-level string field. The documents are sealed,
# canonical and shallow by contract, so this stays a deterministic read rather
# than a general JSON parser.
json_string() {
  sed -n 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1" | head -n 1
}

# json_object_field extracts a string field nested one level inside an object.
json_object_field() {
  tr -d '\n' < "$1" \
    | sed -n 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*{\([^}]*\)}.*/\1/p' \
    | sed -n 's/.*"'"$3"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -n 1
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    fail KB_CREATE_INPUT_REQUIRED "neither sha256sum nor shasum is available for checksum verification"
  fi
}

# fetch_verified downloads a base-relative document and refuses to return it
# unless its bytes hash to the digest the referring document declared. Trust in
# this protocol is exactly this check; nothing downstream re-establishes it.
fetch_verified() {
  path="$1"
  expected="$2"
  target="$3"
  code="$4"
  case "$path" in
    /*|*..*|*://*) fail "$code" "document path is not base-relative: $path" ;;
  esac
  curl -fsSL "${RELEASE_BASE}/${path}" -o "$target" 2>/dev/null \
    || fail "$code" "could not read ${RELEASE_BASE}/${path}"
  if [ -n "$expected" ]; then
    actual="$(sha256_of "$target")"
    if [ "$expected" != "$actual" ]; then
      fail KB_CREATE_RELEASE_DIGEST_MISMATCH "digest mismatch for ${path} (expected ${expected}, got ${actual})"
    fi
  fi
}

print_banner
info "Release endpoint: ${RELEASE_BASE}"
info "Target: ${OS}/${ARCH}"

DESCRIPTOR="${TMP_DIR}/release.json"

if [ -n "$RELEASE_ID" ]; then
  info "Release: ${RELEASE_ID} (exact)"
  # An exact release has no pointer vouching for it, so the descriptor is
  # fetched directly and validated on its own schema.
  fetch_verified "releases/${RELEASE_ID}/release.json" "" "$DESCRIPTOR" KB_CREATE_RELEASE_DESCRIPTOR_UNAVAILABLE
else
  info "Channel: ${CHANNEL}"
  POINTER="${TMP_DIR}/channel.json"
  fetch_verified "channels/${CHANNEL}.json" "" "$POINTER" KB_CREATE_RELEASE_CHANNEL_ABSENT
  POINTER_SCHEMA="$(json_string "$POINTER" schema)"
  if [ "$POINTER_SCHEMA" != "kb.release-channel/1" ]; then
    fail KB_CREATE_RELEASE_LEGACY_UNSUPPORTED \
      "the ${CHANNEL} channel pointer uses a retired contract (${POINTER_SCHEMA:-none}); reinstall with the current installer"
  fi
  RELEASE_ID="$(json_string "$POINTER" releaseId)"
  DESCRIPTOR_PATH="$(json_object_field "$POINTER" release path)"
  DESCRIPTOR_SHA="$(json_object_field "$POINTER" release sha256)"
  [ -n "$DESCRIPTOR_PATH" ] && [ -n "$DESCRIPTOR_SHA" ] \
    || fail KB_CREATE_RELEASE_CHANNEL_ABSENT "the ${CHANNEL} channel pointer does not reference a release descriptor"
  info "Resolved release: ${RELEASE_ID}"
  fetch_verified "$DESCRIPTOR_PATH" "$DESCRIPTOR_SHA" "$DESCRIPTOR" KB_CREATE_RELEASE_DESCRIPTOR_UNAVAILABLE
fi

DESCRIPTOR_SCHEMA="$(json_string "$DESCRIPTOR" schema)"
if [ "$DESCRIPTOR_SCHEMA" != "kb.release/1" ]; then
  fail KB_CREATE_RELEASE_LEGACY_UNSUPPORTED \
    "release ${RELEASE_ID:-<unknown>} uses a retired contract (${DESCRIPTOR_SCHEMA:-none}); reinstall with the current installer"
fi

# Select the launcher artifact for this target out of the descriptor's list.
# Absence here means the release did not publish this target, which is a
# different failure from the target being unsupported outright.
LAUNCHER_ENTRY="$(tr -d '\n ' < "$DESCRIPTOR" \
  | tr '{' '\n' \
  | grep "\"os\":\"${OS}\"" \
  | grep "\"arch\":\"${ARCH}\"" \
  | head -n 1)"
[ -n "$LAUNCHER_ENTRY" ] \
  || fail KB_CREATE_RELEASE_TARGET_UNSUPPORTED "release ${RELEASE_ID} publishes no launcher for ${OS}/${ARCH}"

LAUNCHER_PATH="$(printf '%s' "$LAUNCHER_ENTRY" | sed -n 's/.*"path":"\([^"]*\)".*/\1/p')"
LAUNCHER_SHA="$(printf '%s' "$LAUNCHER_ENTRY" | sed -n 's/.*"sha256":"\([^"]*\)".*/\1/p')"
[ -n "$LAUNCHER_PATH" ] && [ -n "$LAUNCHER_SHA" ] \
  || fail KB_CREATE_RELEASE_DESCRIPTOR_UNAVAILABLE "release ${RELEASE_ID} declares an incomplete launcher artifact for ${OS}/${ARCH}"

info "Downloading launcher..."
TMP_BIN="${TMP_DIR}/${BINARY}"
fetch_verified "$LAUNCHER_PATH" "$LAUNCHER_SHA" "$TMP_BIN" KB_CREATE_RELEASE_DESCRIPTOR_UNAVAILABLE

chmod +x "$TMP_BIN"
mkdir -p "$(dirname "$DEST")"
mv "$TMP_BIN" "$DEST"

ensure_path() {
  destination_dir="$(dirname "$DEST")"
  case ":$PATH:" in
    *":${destination_dir}:"*) return 0 ;;
  esac

  shell_name="$(basename "${SHELL:-}")"
  case "$shell_name" in
    zsh)  profile="${HOME}/.zshrc" ;;
    bash) profile="${HOME}/.bashrc" ;;
    *)
      if [ -f "${HOME}/.zshrc" ]; then profile="${HOME}/.zshrc"
      else profile="${HOME}/.bashrc"; fi
      ;;
  esac

  export_line="export PATH=\"${destination_dir}:\$PATH\""
  marker='# Added by kb-create installer'

  if [ -f "$profile" ] && grep -Fq "$export_line" "$profile" 2>/dev/null; then
    echo ""
    warn "${destination_dir} is in $profile but not yet loaded in this shell."
    printf "  Run: %ssource %s%s\n" "$C_DIM" "$profile" "$C_RESET"
    return 0
  fi

  {
    echo ""
    echo "$marker"
    echo "$export_line"
  } >> "$profile"

  echo ""
  ok "Added ${destination_dir} to PATH via $profile"
  printf "  To use kb-create in this shell, run: %ssource %s%s\n" "$C_DIM" "$profile" "$C_RESET"
}

ensure_path

END_TS="$(date +%s)"
ELAPSED="$((END_TS - START_TS))"

echo ""
ok "${BINARY} installed to $DEST"
ok "Release: ${RELEASE_ID}"
ok "Launcher checksum verified"
ok "Installation completed in ${ELAPSED}s"
echo ""
printf "%sGet started:%s\n" "$C_BOLD" "$C_RESET"
printf "  %skb-create apply --platform-channel %s --request-platform-root ./kb-platform%s\n" "$C_DIM" "$CHANNEL" "$C_RESET"
printf "  %skb-create status --platform-root ./kb-platform%s\n" "$C_DIM" "$C_RESET"
