import { describe, it, expect } from 'vitest';
import { createBufferedUI } from '../mcp/ui.js';

describe('createBufferedUI', () => {
  it('captures info/success/warn/error/debug output', () => {
    const { ui, getOutput } = createBufferedUI();
    ui.info('hello');
    ui.success('done');
    ui.warn('careful');
    ui.error('boom');
    ui.debug('trace');
    expect(getOutput()).toBe('[info] hello\n[ok] done\n[warn] careful\n[error] boom\n[debug] trace');
  });

  it('stringifies Error objects passed to error()', () => {
    const { ui, getOutput } = createBufferedUI();
    ui.error(new Error('kaboom'));
    expect(getOutput()).toBe('[error] kaboom');
  });

  it('captures raw write and json', () => {
    const { ui, getOutput } = createBufferedUI();
    ui.write('raw');
    ui.json({ a: 1 });
    expect(getOutput()).toBe('raw\n{"a":1}');
  });

  it('captures spinner lifecycle', () => {
    const { ui, getOutput } = createBufferedUI();
    const sp = ui.spinner('working');
    sp.update('still working');
    sp.succeed('finished');
    expect(getOutput()).toBe('[spinner] working\n[spinner] still working\n[ok] finished');
  });

  it('returns non-interactive defaults without blocking', async () => {
    const { ui } = createBufferedUI();
    expect(await ui.confirm('ok?')).toBe(true);
    expect(await ui.confirm('ok?', { defaultValue: false })).toBe(false);
    expect(await ui.prompt('name?')).toBe('');
    expect(await ui.prompt('name?', { default: 'x' })).toBe('x');
    expect(await ui.select('pick', [{ label: 'A', value: 'a' }])).toBe('a');
    expect(
      await ui.multiSelect('pick', [
        { label: 'A', value: 'a', checked: true },
        { label: 'B', value: 'b' },
      ]),
    ).toEqual(['a']);
  });
});
