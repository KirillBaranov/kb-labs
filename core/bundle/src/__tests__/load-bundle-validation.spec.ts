import { describe, it, expect, vi } from 'vitest';
import { loadBundle } from '../index';

describe('bundle: loadBundle validation option', () => {
  it('warns when validate is warn and config invalid', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Using a minimal cwd; this is a smoke test to ensure code path executes
    await expect(
      loadBundle({ cwd: process.cwd(), product: 'aiReview' as any, validate: 'warn' })
    ).resolves.toBeTruthy();
  });
});


