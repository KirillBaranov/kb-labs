#!/bin/sh
set -eu

REPO="KirillBaranov/kb-labs"
BINARY="kb-monitor"
DEST="${HOME}/.local/bin/${BINARY}"
VERSION="latest"
RESOLVED_VERSION=""
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

info() { printf "%s[INFO]%s %s\n" "$C_CYAN"   "$C_RESET" "$1"; }
ok()   { printf "%s[ OK ]%s %s\n" "$C_GREEN"  "$C_RESET" "$1"; }
warn() { printf "%s[WARN]%s %s\n" "$C_YELLOW" "$C_RESET" "$1"; }
err()  { printf "%s[ERR ]%s %s\n" "$C_RED"    "$C_RESET" "$1" >&2; }

usage() {
  cat <<'EOF'
Usage: install.sh [--version <tag>] [--dest <path>]

Options:
  --version <tag>   Install specific release tag (example: v1.2.3)
  --dest <path>     Install binary to a custom path (default: ~/.local/bin/kb-dev)
  -h, --help        Show this help
EOF
}

print_banner() {
  cat <<'EOF'
  _    _             _
 | | _| |__       __| | _____   __
 | |/ / '_ \ ____/ _` |/ _ \ \ / /
 |   <| |_) |___| (_| |  __/\ V /
 |_|\_\_.__/     \__,_|\___| \_/

EOF
  printf "%skb-monitor — remote observability for deployed services%s\n" "$C_BOLD" "$C_RESET"
  echo ""
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      shift
      if [ "$#" -eq 0 ]; then
        err "--version requires a value (example: v1.2.3)."
        exit 1
      fi
      VERSION="$1"
      ;;
    --dest)
      shift
      if [ "$#" -eq 0 ]; then
        err "--dest requires a path."
        exit 1
      fi
      DEST="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      err "Unknown argument: $1"
      usage >&2
      exit 1
      ;;
  esac
  shift
done

# ── Prerequisites ─────────────────────────────────────────────────────────────

if ! command -v curl >/dev/null 2>&1; then
  err "curl is required but not found in PATH."
  exit 1
fi

# ── Platform detection ────────────────────────────────────────────────────────

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64)          ARCH="amd64" ;;
  aarch64|arm64)   ARCH="arm64" ;;
  *)
    err "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

EXT=""
case "$OS" in
  darwin|linux) ;;
  mingw*|msys*|cygwin*)
    OS="windows"
    EXT=".exe"
    ;;
  *)
    err "Unsupported OS: $OS"
    exit 1
    ;;
esac

# ── Version resolution ────────────────────────────────────────────────────────

if [ "$VERSION" = "latest" ]; then
  # Prefer API-resolved tag; fall back to GitHub's built-in latest/download
  # if the API is unavailable or rate-limited.
  RESOLVED_VERSION="$(
    curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=1" 2>/dev/null \
    | sed -n 's/^[[:space:]]*"tag_name":[[:space:]]*"\([^"]*\)".*$/\1/p' \
    | head -n 1
  )"
  if [ -n "$RESOLVED_VERSION" ]; then
    BASE_URL="https://github.com/${REPO}/releases/download/${RESOLVED_VERSION}"
  else
    warn "GitHub API unavailable; falling back to releases/latest/download."
    BASE_URL="https://github.com/${REPO}/releases/latest/download"
  fi
else
  RESOLVED_VERSION="$VERSION"
  BASE_URL="https://github.com/${REPO}/releases/download/${RESOLVED_VERSION}"
fi

BINARY_FILE="${BINARY}-${OS}-${ARCH}${EXT}"
BINARY_URL="${BASE_URL}/${BINARY_FILE}"
CHECKSUMS_URL="${BASE_URL}/checksums.txt"

# ── Download ──────────────────────────────────────────────────────────────────

print_banner
info "Repository : ${REPO}"
if [ "$VERSION" = "latest" ]; then
  if [ -n "$RESOLVED_VERSION" ]; then
    info "Channel    : latest (resolved to ${RESOLVED_VERSION})"
  else
    info "Channel    : latest (GitHub latest/download)"
  fi
else
  info "Channel    : pinned (${RESOLVED_VERSION})"
fi
info "Target     : ${OS}/${ARCH}  →  ${BINARY_FILE}"
info "Destination: ${DEST}"
echo ""

TMP_BIN="$(mktemp)"
TMP_SUM="$(mktemp)"
cleanup() { rm -f "$TMP_BIN" "$TMP_SUM"; }
trap cleanup EXIT

info "Downloading ${BINARY_FILE}..."
if ! curl -fsSL "$BINARY_URL" -o "$TMP_BIN"; then
  err "Download failed: ${BINARY_URL}"
  err "Check that release ${RESOLVED_VERSION:-latest} exists for ${OS}/${ARCH}."
  exit 1
fi

info "Downloading checksums..."
if ! curl -fsSL "$CHECKSUMS_URL" -o "$TMP_SUM"; then
  err "Checksum download failed: ${CHECKSUMS_URL}"
  exit 1
fi

# ── Checksum verification ─────────────────────────────────────────────────────

EXPECTED="$(grep "  ${BINARY_FILE}$" "$TMP_SUM" | awk '{print $1}' | head -n 1)"
if [ -z "$EXPECTED" ]; then
  err "Checksum for ${BINARY_FILE} not found in checksums.txt."
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$TMP_BIN" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL="$(shasum -a 256 "$TMP_BIN" | awk '{print $1}')"
else
  err "Neither sha256sum nor shasum found. Cannot verify checksum."
  exit 1
fi

if [ "$EXPECTED" != "$ACTUAL" ]; then
  err "Checksum mismatch for ${BINARY_FILE}."
  err "Expected : $EXPECTED"
  err "Actual   : $ACTUAL"
  exit 1
fi

# ── Install ───────────────────────────────────────────────────────────────────

chmod +x "$TMP_BIN"
mkdir -p "$(dirname "$DEST")"
mv "$TMP_BIN" "$DEST"

# ── PATH check ────────────────────────────────────────────────────────────────

DEST_DIR="$(dirname "$DEST")"
case ":$PATH:" in
  *":${DEST_DIR}:"*) ;;
  *)
    echo ""
    warn "${DEST_DIR} is not in your PATH."
    printf "  Add this to your shell profile (~/.zshrc or ~/.bashrc):\n"
    printf "  %sexport PATH=\"%s:\$PATH\"%s\n" "$C_DIM" "$DEST_DIR" "$C_RESET"
    ;;
esac

# ── Done ──────────────────────────────────────────────────────────────────────

END_TS="$(date +%s)"
ELAPSED="$((END_TS - START_TS))"

echo ""
ok "${BINARY} installed to ${DEST}"
ok "Checksum verified (${BINARY_FILE})"
if [ -n "$RESOLVED_VERSION" ]; then
  ok "Version: ${RESOLVED_VERSION}"
else
  ok "Version: latest"
fi
ok "Installation completed in ${ELAPSED}s"
echo ""
printf "%sGet started:%s\n" "$C_BOLD" "$C_RESET"
printf "  %s# create devservices.yaml in your project, then:%s\n" "$C_DIM" "$C_RESET"
printf "  %skb-dev start%s\n" "$C_DIM" "$C_RESET"
printf "  %skb-dev status%s\n" "$C_DIM" "$C_RESET"
printf "  %skb-dev doctor%s\n" "$C_DIM" "$C_RESET"
echo ""
printf "  %sDocs: https://kblabs.ru/docs/services/kb-monitor%s\n" "$C_DIM" "$C_RESET"
