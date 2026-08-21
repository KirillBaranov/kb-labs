import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { hasLocalRuntimeState, resolveLocalGatewayUrl, resolveNetOffset } from '../net-offset.js';

describe('local runtime offset', () => {
  it('reads the project-local offset state', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'kb-offset-'));
    mkdirSync(join(cwd, '.kb'));
    writeFileSync(join(cwd, '.kb', 'net-offset.json'), '{"offset":20000}');
    expect(resolveNetOffset(cwd)).toBe(20000);
    expect(resolveLocalGatewayUrl(cwd)).toBe('http://127.0.0.1:24000');
    expect(hasLocalRuntimeState(cwd)).toBe(true);
  });
});
