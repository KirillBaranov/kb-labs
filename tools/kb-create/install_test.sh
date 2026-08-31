#!/usr/bin/env bash
# Test suite for install.sh — the `curl … | sh` entry point.
#
# PR 7 rewrote install.sh onto the release control-plane descriptor protocol:
#
#   channels/<channel>.json  ->  releases/<id>/release.json  ->  launcher binary
#
# This suite was written against the *previous* script, which resolved a
# `binaries-<channel>/channel.json` GitHub Release asset by regex on a `tag`
# field and verified the download against a `checksums.txt`. None of that
# exists any more, so every one of those assertions had become a statement
# about a script that is gone — cutover deletion checklist §11, "legacy
# fixture/E2E paths that assert old behaviour". It is rewritten here rather
# than deleted, because install.sh is the one artifact every single user runs
# and it has no other test.
#
# Runs fully offline: `curl` is a shim placed first on PATH that serves a
# fixture document tree, so no network, no GitHub release and no real endpoint
# is involved. HOME is a fresh temporary directory for every case — install.sh
# appends a PATH line to a shell profile, and a test that let it reach the real
# HOME would edit the developer's own dotfiles.
#
# Usage:
#   bash tools/kb-create/install_test.sh
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_SH="$SCRIPT_DIR/install.sh"
# Resolved once, up front, against the real PATH — invoked by absolute path
# below so overriding PATH for install.sh's own tool lookups (curl, uname,
# etc.) doesn't also break finding the bash interpreter that runs it.
SYS_BASH="$(command -v bash)"

# A host that cannot resolve, so a shim that failed to intercept a request
# would time out visibly rather than silently reaching the internet.
RELEASE_BASE="https://releases.invalid"

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); printf '✅ %s\n' "$1"; }
fail() {
  FAIL=$((FAIL + 1))
  printf '❌ %s\n' "$1"
  printf '   %s\n' "$2"
}

sha256_of() { shasum -a 256 "$1" | awk '{print $1}'; }

# ── Host target, computed the way install.sh computes it ────────────────────
#
# The descriptor's launcher list is keyed by {os, arch}, so the fixture has to
# name the target this machine will actually ask for.

HOST_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$(uname -m)" in
  x86_64 | amd64) HOST_ARCH="amd64" ;;
  aarch64 | arm64) HOST_ARCH="arm64" ;;
  *) HOST_ARCH="$(uname -m)" ;;
esac

FAKE_BIN_CONTENT="fake-kb-create-launcher"
RELEASE_ID="platform-9.9.9"

# ── Fixture document tree ───────────────────────────────────────────────────
#
# build_fixture writes a well-formed published release into $1, then applies
# the named defect. Each defect is one document changed in one way, so a test
# that fails names exactly which link of the chain broke.
#
# Defects:
#   (none)                 a complete, self-consistent publication
#   legacy-pointer         the pre-cutover channel document (§7.2 tombstone shape)
#   no-pointer             the channel was never published
#   no-descriptor          the pointer resolves to a descriptor that is absent
#   bad-descriptor-digest  the pointer's digest does not match the descriptor
#   bad-launcher-digest    the descriptor's digest does not match the binary
#   foreign-target         the release publishes no launcher for this host

build_fixture() {
  local root="$1" defect="${2:-}"
  mkdir -p "$root/channels" "$root/releases/$RELEASE_ID" "$root/bin"

  local launcher="$root/bin/kb-create-${HOST_OS}-${HOST_ARCH}"
  printf '%s' "$FAKE_BIN_CONTENT" >"$launcher"
  local launcher_sha
  launcher_sha="$(sha256_of "$launcher")"
  [ "$defect" = "bad-launcher-digest" ] && launcher_sha="$(printf '0%.0s' {1..64})"

  local entry_os="$HOST_OS" entry_arch="$HOST_ARCH"
  if [ "$defect" = "foreign-target" ]; then
    # A real, supported target that is simply not this machine.
    entry_os="linux"
    entry_arch="amd64"
    [ "$HOST_OS/$HOST_ARCH" = "linux/amd64" ] && { entry_os="darwin"; entry_arch="arm64"; }
  fi

  local descriptor="$root/releases/$RELEASE_ID/release.json"
  cat >"$descriptor" <<EOF
{
  "schema": "kb.release/1",
  "releaseId": "$RELEASE_ID",
  "launchers": [
    {
      "id": "kb-create",
      "os": "$entry_os",
      "arch": "$entry_arch",
      "path": "bin/kb-create-${HOST_OS}-${HOST_ARCH}",
      "sha256": "$launcher_sha"
    }
  ]
}
EOF
  [ "$defect" = "no-descriptor" ] && rm -f "$descriptor"

  local descriptor_sha="unpublished"
  [ -f "$descriptor" ] && descriptor_sha="$(sha256_of "$descriptor")"
  [ "$defect" = "bad-descriptor-digest" ] && descriptor_sha="$(printf '0%.0s' {1..64})"

  if [ "$defect" = "legacy-pointer" ]; then
    # Exactly the document the retired channel asset served, and exactly the
    # tombstone's own shape: an integer `schema`, and no `kb.release-channel/1`.
    cat >"$root/channels/stable.json" <<'EOF'
{
  "status": "retired",
  "contract": "kb.release-legacy/0",
  "message": "This distribution channel was retired.",
  "supersededBy": "https://releases.invalid/channels/stable.json"
}
EOF
  else
    cat >"$root/channels/stable.json" <<EOF
{
  "schema": "kb.release-channel/1",
  "channel": "stable",
  "releaseId": "$RELEASE_ID",
  "release": { "path": "releases/$RELEASE_ID/release.json", "sha256": "$descriptor_sha" },
  "signature": null
}
EOF
  fi
  [ "$defect" = "no-pointer" ] && rm -f "$root/channels/stable.json"
  return 0
}

# write_fake_curl installs a curl shim that serves $FAKE_DOC_ROOT. It maps the
# request URL back to a path under the fixture root and exits 22 — curl's own
# "HTTP error" status under -f — when the document is absent, which is what a
# real endpoint returns for a channel that was never published.
write_fake_curl() {
  # POSIX sh with an absolute interpreter: the shim runs with the curated PATH,
  # where `env` could not find a `bash` to resolve.
  cat >"$1/curl" <<'SHIM'
#!/bin/sh
set -u
url=""
outfile=""
want_out=0
for arg in "$@"; do
  if [ "$want_out" = 1 ]; then outfile="$arg"; want_out=0; continue; fi
  case "$arg" in
    -o) want_out=1 ;;
    http*) url="$arg" ;;
  esac
done
# Everything after the scheme+host is the base-relative document path.
path="${url#*://}"
path="${path#*/}"
src="${FAKE_DOC_ROOT}/${path}"
[ -f "$src" ] || exit 22
if [ -n "$outfile" ]; then cp "$src" "$outfile"; else cat "$src"; fi
SHIM
  chmod +x "$1/curl"
}

# curated_path builds a bin dir with symlinks to every external tool install.sh
# needs, EXCEPT the ones named in $@ — used to simulate "tool missing from
# PATH".
curated_path() {
  local dir="$1"
  shift
  local exclude=" $* "
  # `cp` is here for the curl shim rather than for install.sh, which never
  # copies: the shim serves the fixture tree and needs it on the curated PATH.
  for tool in uname tr grep awk sed head mktemp rm chmod mkdir mv cp date basename dirname cat sha256sum shasum; do
    case "$exclude" in
      *" $tool "*) continue ;;
    esac
    local real
    real="$(command -v "$tool" 2>/dev/null || true)"
    [ -n "$real" ] && ln -sf "$real" "$dir/$tool"
  done
  return 0
}

# run_install runs install.sh against a fixture tree with a fresh HOME and a
# curated PATH, capturing stdout+stderr and the exit code into RUN_OUT /
# RUN_CODE / RUN_HOME.
run_install() {
  local defect="${FIXTURE_DEFECT:-}"
  RUN_HOME="$(mktemp -d)"
  local docroot fakebin
  docroot="$(mktemp -d)"
  fakebin="$(mktemp -d)"
  build_fixture "$docroot" "$defect"
  write_fake_curl "$fakebin"
  curated_path "$fakebin" ${EXTRA_EXCLUDE:-}
  RUN_OUT="$(HOME="$RUN_HOME" PATH="$fakebin" FAKE_DOC_ROOT="$docroot" \
    "$SYS_BASH" "$INSTALL_SH" --release-base "$RELEASE_BASE" "$@" 2>&1)"
  RUN_CODE=$?
}

# expect_failure asserts a non-zero exit carrying diagnostic code $2, and that
# nothing was installed. "Nothing installed" is half of every one of these
# cases: a refusal that still leaves a binary behind is not a refusal.
expect_failure() {
  local name="$1" code="$2"
  if [ "$RUN_CODE" -eq 0 ]; then
    fail "$name" "expected a non-zero exit, got 0. Output:\n$RUN_OUT"
    return 1
  fi
  case "$RUN_OUT" in
    *"$code"*) ;;
    *) fail "$name" "expected diagnostic $code in output:\n$RUN_OUT"; return 1 ;;
  esac
  if [ -e "$RUN_HOME/.local/bin/kb-create" ]; then
    fail "$name" "a launcher was installed despite the failure"
    return 1
  fi
  return 0
}

# ── 1. The happy path, end to end through both hops ─────────────────────────

test_success_path() {
  FIXTURE_DEFECT="" run_install
  if [ "$RUN_CODE" -ne 0 ]; then
    fail "success path" "expected exit 0, got $RUN_CODE. Output:\n$RUN_OUT"
    return
  fi
  local dest="$RUN_HOME/.local/bin/kb-create"
  if [ ! -x "$dest" ]; then
    fail "success path" "no executable launcher at $dest. Output:\n$RUN_OUT"
    return
  fi
  if [ "$(cat "$dest")" != "$FAKE_BIN_CONTENT" ]; then
    fail "success path" "installed bytes are not the fixture launcher's bytes"
    return
  fi
  case "$RUN_OUT" in
    *"Resolved release: $RELEASE_ID"*) ;;
    *) fail "success path" "installer did not report the resolved release:\n$RUN_OUT"; return ;;
  esac
  case "$RUN_OUT" in
    *"Launcher checksum verified"*) ;;
    *) fail "success path" "installer did not report digest verification:\n$RUN_OUT"; return ;;
  esac
  pass "success path: pointer → descriptor → launcher, every hop digest-verified"
}

# ── 2. The pre-cutover channel document ─────────────────────────────────────

test_legacy_pointer_rejected() {
  # §7.2/§7.3: a document from the retired epoch is refused on its schema, as a
  # legacy failure specifically — not as a missing channel and not as a corrupt
  # one. This is the case a cached old endpoint, or the frozen tombstone,
  # actually produces.
  FIXTURE_DEFECT="legacy-pointer" run_install
  expect_failure "legacy pointer" "KB_CREATE_RELEASE_LEGACY_UNSUPPORTED" || return
  pass "legacy pointer: retired contract refused with the legacy diagnostic, nothing downloaded"
}

# ── 3. Missing channel pointer ──────────────────────────────────────────────

test_missing_pointer() {
  FIXTURE_DEFECT="no-pointer" run_install
  expect_failure "missing pointer" "KB_CREATE_RELEASE_CHANNEL_ABSENT" || return
  pass "missing pointer: an unpublished channel is a typed refusal, not a fallback"
}

# ── 4. A digest that does not match, at each hop ────────────────────────────

test_descriptor_digest_mismatch() {
  FIXTURE_DEFECT="bad-descriptor-digest" run_install
  expect_failure "descriptor digest" "KB_CREATE_RELEASE_DIGEST_MISMATCH" || return
  pass "descriptor digest mismatch: the pointer's claim is enforced over the bytes"
}

test_launcher_digest_mismatch() {
  FIXTURE_DEFECT="bad-launcher-digest" run_install
  expect_failure "launcher digest" "KB_CREATE_RELEASE_DIGEST_MISMATCH" || return
  pass "launcher digest mismatch: the descriptor's claim is enforced over the binary"
}

# ── 5. A release that does not publish this target ──────────────────────────

test_target_not_published() {
  # Distinct from "this target is unsupported": the matrix allows it, this
  # particular release just did not ship it. Collapsing the two would tell a
  # linux/arm64 user their platform is unsupported when it is not.
  FIXTURE_DEFECT="foreign-target" run_install
  expect_failure "target not published" "KB_CREATE_RELEASE_TARGET_UNSUPPORTED" || return
  case "$RUN_OUT" in
    *"publishes no launcher"*) ;;
    *) fail "target not published" "expected the release-specific wording:\n$RUN_OUT"; return ;;
  esac
  pass "target not published: reported as a gap in this release, not as an unsupported platform"
}

# ── 6. An exact release bypasses the channel entirely ───────────────────────

test_exact_release() {
  # `--release` has no pointer vouching for it, so the descriptor is fetched
  # directly. The fixture's pointer is legacy here to prove it is genuinely
  # never read: if the script consulted it, this case would fail.
  FIXTURE_DEFECT="legacy-pointer" run_install --release "$RELEASE_ID"
  if [ "$RUN_CODE" -ne 0 ]; then
    fail "exact release" "expected exit 0, got $RUN_CODE. Output:\n$RUN_OUT"
    return
  fi
  if [ ! -x "$RUN_HOME/.local/bin/kb-create" ]; then
    fail "exact release" "no launcher installed. Output:\n$RUN_OUT"
    return
  fi
  case "$RUN_OUT" in
    *"(exact)"*) ;;
    *) fail "exact release" "installer did not report an exact resolution:\n$RUN_OUT"; return ;;
  esac
  pass "exact release: --release resolves the descriptor directly, reading no channel pointer"
}

# ── 7. Channel names outside the contract ───────────────────────────────────

test_invalid_channel() {
  FIXTURE_DEFECT="" run_install --channel bogus
  expect_failure "invalid channel" "KB_CREATE_RELEASE_CHANNEL_ABSENT" || return
  pass "invalid channel: rejected before any request is made"
}

test_channel_requires_value() {
  FIXTURE_DEFECT="" run_install --channel
  expect_failure "channel requires value" "KB_CREATE_INPUT_REQUIRED" || return
  pass "--channel with no value: rejected with a typed input error"
}

# ── 8. Argument surface ─────────────────────────────────────────────────────

test_help() {
  FIXTURE_DEFECT="" run_install --help
  if [ "$RUN_CODE" -ne 0 ]; then
    fail "--help" "expected exit 0, got $RUN_CODE. Output:\n$RUN_OUT"
    return
  fi
  # Decision S0.3c: Windows is off the matrix, and the entry point says so
  # rather than failing obscurely on an unrecognised uname.
  case "$RUN_OUT" in
    *"Windows is not supported"*) ;;
    *) fail "--help" "usage does not state the supported matrix:\n$RUN_OUT"; return ;;
  esac
  pass "--help: prints usage including the supported matrix, exits 0"
}

test_unknown_argument() {
  FIXTURE_DEFECT="" run_install --index /tmp/release-index.json
  # The retired flag is not quietly ignored: an old CI job that still passes it
  # must fail loudly rather than install something it did not ask for.
  expect_failure "unknown argument" "KB_CREATE_INPUT_REQUIRED" || return
  pass "unknown argument: the retired --index flag is refused, not ignored"
}

# ── 9. curl absent ──────────────────────────────────────────────────────────

test_curl_missing() {
  # Not `expect_failure`: with no curl on PATH the shim is gone too, so this is
  # the one case that must not build a fixture expectation around a download.
  local run_home fakebin
  run_home="$(mktemp -d)"
  fakebin="$(mktemp -d)"
  curated_path "$fakebin"
  local out code
  out="$(HOME="$run_home" PATH="$fakebin" "$SYS_BASH" "$INSTALL_SH" 2>&1)"
  code=$?
  if [ "$code" -eq 0 ]; then
    fail "curl missing" "expected a non-zero exit, got 0. Output:\n$out"
    return
  fi
  case "$out" in
    *"curl is required"*) ;;
    *) fail "curl missing" "expected the missing-curl diagnostic:\n$out"; return ;;
  esac
  pass "curl missing: refused up front with a prerequisite error"
}

# ── Run ─────────────────────────────────────────────────────────────────────

printf '── install.sh (descriptor protocol) ──\n\n'

test_success_path
test_legacy_pointer_rejected
test_missing_pointer
test_descriptor_digest_mismatch
test_launcher_digest_mismatch
test_target_not_published
test_exact_release
test_invalid_channel
test_channel_requires_value
test_help
test_unknown_argument
test_curl_missing

printf '\n── install.sh test summary ──\n'
printf '  passed: %d\n' "$PASS"
printf '  failed: %d\n' "$FAIL"
[ "$FAIL" -eq 0 ]
