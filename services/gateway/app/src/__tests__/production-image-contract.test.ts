import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dockerfile = readFileSync(resolve(__dirname, '../../Dockerfile'), 'utf-8');
const entrypoint = readFileSync(resolve(__dirname, '../../docker-entrypoint.sh'), 'utf-8');

describe('gateway production image contract', () => {
  it('does not bake a configuration or marketplace lock into the release image', () => {
    expect(dockerfile).not.toContain('kb.config.prod.json');
    expect(dockerfile).not.toContain('marketplace.prod.lock');
    expect(dockerfile).not.toContain('kb.config.default.json');
    expect(dockerfile).not.toContain('marketplace.default.lock');
  });

  it('fails before starting when kb-create has not materialized a composition', () => {
    expect(entrypoint).toContain('/app/.kb/kb.config.json is required');
    expect(entrypoint).toContain('/app/.kb/marketplace.lock is required');
    expect(entrypoint).not.toContain('cp /app/.kb/');
  });
});
