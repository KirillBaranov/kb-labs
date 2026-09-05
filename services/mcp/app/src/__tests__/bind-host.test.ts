/**
 * Regression test: the MCP daemon used to default its bind host to
 * "localhost" (manifest.ts's KB_MCP_DAEMON_HOST default, and
 * bootstrap.ts's defaultHost passed to runService()) while every other
 * daemon in the platform (marketplace-registry, marketplace, workflow,
 * rest-api) defaults to "0.0.0.0" specifically for Docker/dev compat.
 *
 * On the Ubuntu-based E2E Docker image, Fastify/Node resolving the string
 * "localhost" via DNS returned the IPv6 loopback address ([::1]) only, not
 * dual-stack — confirmed live via the mcp-daemon.log of a failing
 * `E2E Platform Tests / e2e-mcp` CI run: `"MCP daemon listening"
 * {"address":"http://[::1]:7779"}`. The daemon's own in-container health
 * check (also resolving "localhost") happened to succeed via ::1, masking
 * the bug — but Playwright's e2e client, hitting the container's published
 * port over IPv4 from a separate container, got "socket hang up" on every
 * request: nothing was listening on the IPv4 side. This reproduced across
 * multiple unrelated commits (i.e. a real, standing bug, not a one-off
 * flake), and one run even passed — consistent with "localhost" DNS
 * resolution order being environment-dependent rather than deterministic.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { manifest } from '../manifest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('MCP daemon — default bind host', () => {
  it('manifest.env.KB_MCP_DAEMON_HOST defaults to 0.0.0.0, not localhost', () => {
    expect(manifest.env?.KB_MCP_DAEMON_HOST?.default).toBe('0.0.0.0');
  });

  it('bootstrap.ts passes defaultHost: "0.0.0.0" to runService (matching every other platform daemon)', () => {
    const source = readFileSync(join(__dirname, '..', 'bootstrap.ts'), 'utf8');
    // A lightweight source assertion rather than exercising the full
    // runService/Fastify listen stack here — daemon.ts's own
    // resolveNetwork() unit tests already cover defaultHost precedence;
    // this test's job is only to pin mcp-app's own call site.
    expect(source).toMatch(/defaultHost:\s*"0\.0\.0\.0"/);
    expect(source).not.toMatch(/defaultHost:\s*"localhost"/);
  });
});
