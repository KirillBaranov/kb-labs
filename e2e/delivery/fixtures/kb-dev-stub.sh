#!/usr/bin/env bash
# Stub kb-dev used by the delivery e2e. The first e2e scenario exercises
# kb-create + kb-deploy + pnpm + SSH; integrating real kb-dev lifecycle
# (which requires devservices.yaml bootstrap on target) is a follow-up.
#
# Recognised subcommands: restart, ready, start, stop, status, health.
# All exit 0. Unknown subcommands exit 1 so genuine bugs still surface.
set -e
case "${1:-}" in
  restart|ready|start|stop|status|health) exit 0 ;;
  *) echo "kb-dev-stub: unknown subcommand: $*" >&2; exit 1 ;;
esac
