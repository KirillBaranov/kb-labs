import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { runSafeBuild } from '../build';

describe('release build governed execution', () => {
  it('delegates build commands to the injected shell with structured argv', async () => {
    const packagePath = join(tmpdir(), `kb-release-build-test-${randomBytes(4).toString('hex')}`);
    await mkdir(packagePath, { recursive: true });
    await writeFile(join(packagePath, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { build: 'echo ok' } }));

    const calls: Array<{ command: string; args: string[]; cwd?: string; timeout?: number; env?: Record<string, string> }> = [];
    const shell = {
      async exec(command: string, args: string[] = [], options: { cwd?: string; timeout?: number; env?: Record<string, string> } = {}) {
        calls.push({ command, args, cwd: options.cwd, timeout: options.timeout, env: options.env });
        return { code: 0, stdout: 'governed-build', stderr: '', ok: true };
      },
    };

    const result = await runSafeBuild(packagePath, 'fixture', shell);

    expect(result.success).toBe(true);
    expect(calls).toEqual([{
      command: 'pnpm',
      args: ['run', 'build'],
      cwd: packagePath,
      timeout: 300_000,
      // NODE_ENV=production disables Module Federation dts generation in
      // Studio rspack configs — a reproducible source of indefinite
      // native-threadpool hangs under concurrent builds (see build.ts).
      env: { NODE_ENV: 'production' },
    }]);
  });
});
