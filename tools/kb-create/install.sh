#!/bin/sh
set -eu

REPO="KirillBaranov/kb-labs"
BINARY="kb-create"
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

info() { printf "%s[INFO]%s %s\n" "$C_CYAN" "$C_RESET" "$1"; }
ok() { printf "%s[ OK ]%s %s\n" "$C_GREEN" "$C_RESET" "$1"; }
warn() { printf "%s[WARN]%s %s\n" "$C_YELLOW" "$C_RESET" "$1"; }
err() { printf "%s[ERR ]%s %s\n" "$C_RED" "$C_RESET" "$1" >&2; }

usage() {
  cat <<'EOF'
Usage: install.sh [--version <tag>]

Options:
  --version <tag>   Install specific release tag (example: v1.2.3)
  -h, --help        Show this help
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
    --version)
      shift
      if [ "$#" -eq 0 ]; then
        echo "Error: --version requires a value (example: v1.2.3)." >&2
        exit 1
      fi
      VERSION="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if ! command -v curl >/dev/null 2>&1; then
  err "curl is required but not found in PATH."
  exit 1
fi

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    err "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

case "$OS" in
  darwin|linux) ;;
  *)
    err "Unsupported OS: $OS"
    exit 1
    ;;
esac

if [ "$VERSION" = "latest" ]; then
  # Prefer API-resolved tag (works with pre-releases), but gracefully fall
  # back to GitHub's built-in latest/download if API is rate-limited.
  RESOLVED_VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=1" 2>/dev/null | sed -n 's/^[[:space:]]*"tag_name":[[:space:]]*"\([^"]*\)".*$/\1/p' | head -n 1)"
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

BINARY_FILE="${BINARY}-${OS}-${ARCH}"
BINARY_URL="${BASE_URL}/${BINARY_FILE}"
CHECKSUMS_URL="${BASE_URL}/checksums.txt"

print_banner
info "Repository: ${REPO}"
if [ "$VERSION" = "latest" ]; then
  if [ -n "$RESOLVED_VERSION" ]; then
    info "Channel: latest (resolved to ${RESOLVED_VERSION})"
  else
    info "Channel: latest (GitHub latest/download)"
  fi
else
  info "Channel: pinned (${RESOLVED_VERSION})"
fi
info "Target: ${OS}/${ARCH}  ->  ${BINARY_FILE}"
echo ""

TMP_BIN="$(mktemp)"
TMP_SUM="$(mktemp)"
cleanup() {
  rm -f "$TMP_BIN" "$TMP_SUM"
}
trap cleanup EXIT

info "Downloading ${BINARY_FILE}..."
curl -fsSL "$BINARY_URL" -o "$TMP_BIN"

info "Downloading checksums..."
curl -fsSL "$CHECKSUMS_URL" -o "$TMP_SUM"

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
  err "Neither sha256sum nor shasum found for checksum verification."
  exit 1
fi

if [ "$EXPECTED" != "$ACTUAL" ]; then
  err "Checksum mismatch for ${BINARY_FILE}."
  err "Expected: $EXPECTED"
  err "Actual:   $ACTUAL"
  exit 1
fi

chmod +x "$TMP_BIN"
mkdir -p "$(dirname "$DEST")"
mv "$TMP_BIN" "$DEST"

ensure_path() {
  # Already in current shell's PATH? Nothing to do.
  case ":$PATH:" in
    *":${HOME}/.local/bin:"*) return 0 ;;
  esac

  # Pick the user's shell profile. Prefer the one matching $SHELL.
  shell_name="$(basename "${SHELL:-}")"
  case "$shell_name" in
    zsh)  profile="${HOME}/.zshrc" ;;
    bash) profile="${HOME}/.bashrc" ;;
    *)
      # Fallback: prefer .zshrc if it exists (macOS default), else .bashrc.
      if [ -f "${HOME}/.zshrc" ]; then profile="${HOME}/.zshrc"
      else profile="${HOME}/.bashrc"; fi
      ;;
  esac

  export_line='export PATH="$HOME/.local/bin:$PATH"'
  marker='# Added by kb-create installer'

  # If already recorded in the profile, just remind the user to reload.
  if [ -f "$profile" ] && grep -Fq "$export_line" "$profile" 2>/dev/null; then
    echo ""
    warn "~/.local/bin is in $profile but not yet loaded in this shell."
    printf "  Run: %ssource %s%s\n" "$C_DIM" "$profile" "$C_RESET"
    printf "  Or open a new terminal window.\n"
    return 0
  fi

  # Append PATH export to the chosen profile.
  {
    echo ""
    echo "$marker"
    echo "$export_line"
  } >> "$profile"

  echo ""
  ok "Added ~/.local/bin to PATH via $profile"
  printf "  To use kb-create in this shell, run: %ssource %s%s\n" "$C_DIM" "$profile" "$C_RESET"
  printf "  Or open a new terminal window.\n"
}

ensure_path

END_TS="$(date +%s)"
ELAPSED="$((END_TS - START_TS))"

echo ""
ok "${BINARY} installed to $DEST"
ok "Checksum verified (${BINARY_FILE})"
if [ -n "$RESOLVED_VERSION" ]; then
  ok "Version: ${RESOLVED_VERSION}"
else
  ok "Version: latest"
fi
ok "Installation completed in ${ELAPSED}s"
echo ""
printf "%sGet started:%s\n" "$C_BOLD" "$C_RESET"
printf "  %skb-create my-project%s\n" "$C_DIM" "$C_RESET"
printf "  %skb-create status%s\n" "$C_DIM" "$C_RESET"
