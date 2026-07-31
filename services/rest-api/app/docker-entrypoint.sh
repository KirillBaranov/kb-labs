#!/bin/sh
# Applies the baked-in default composition only if nothing was mounted over
# the live path. A file bind-mounted at .kb/kb.config.json or
# .kb/marketplace.lock always wins — this never overwrites an existing file.
set -e

if [ ! -f /app/.kb/kb.config.json ]; then
  cp /app/.kb/kb.config.default.json /app/.kb/kb.config.json
fi

if [ ! -f /app/.kb/marketplace.lock ]; then
  cp /app/.kb/marketplace.default.lock /app/.kb/marketplace.lock
fi

exec "$@"
