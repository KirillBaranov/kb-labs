#!/usr/bin/env bash
# Shared secret sanitization — source this file, then pipe text through: sanitize_secrets
# Covers tokens, API keys, passwords in URLs, private keys, and other common leaks.

sanitize_secrets() {
  sed -E \
    -e 's/gho_[A-Za-z0-9]{10,}/[REDACTED]/g' \
    -e 's/ghp_[A-Za-z0-9]{10,}/[REDACTED]/g' \
    -e 's/ghs_[A-Za-z0-9]{10,}/[REDACTED]/g' \
    -e 's/ghr_[A-Za-z0-9]{10,}/[REDACTED]/g' \
    -e 's/github_pat_[A-Za-z0-9_]{10,}/[REDACTED]/g' \
    -e 's/sk-ant-[A-Za-z0-9_\-]{10,}/[REDACTED]/g' \
    -e 's/sk-[A-Za-z0-9]{32,}/[REDACTED]/g' \
    -e 's/AKIA[A-Z0-9]{16}/[REDACTED]/g' \
    -e 's/ASIA[A-Z0-9]{16}/[REDACTED]/g' \
    -e 's/[A-Za-z0-9/+]{40}([^A-Za-z0-9/+=]|$)/[REDACTED]\1/g' \
    -e 's|://[^/:@]+:[^/:@]+@|://[REDACTED]:[REDACTED]@|g' \
    -e 's/(password|passwd|secret|token|api_key|apikey|access_key|private_key)([ ]*[=:]["'"'"' ]*)[^ '"'"'">,\n]{6,}/\1\2[REDACTED]/gI' \
    -e 's/-----BEGIN [A-Z ]+ PRIVATE KEY-----[^-]*-----END [A-Z ]+ PRIVATE KEY-----/[REDACTED PRIVATE KEY]/g' \
    -e 's/eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}/[REDACTED JWT]/g'
}
