import { describe, it, expect, vi } from 'vitest';
import { confirmDestructive, renderDestructiveMessage, type DestructiveAction } from './destructive';

const ACTION: DestructiveAction = {
  action: 'mind drop',
  resource: 'index "code"',
  effect: 'deletes all vectors',
  severity: 'high',
  reversible: true,
  recovery: 're-index from source',
  blastRadius: { count: 100, unit: 'vectors', scope: 'whole index' },
};

function ctx() {
  return { ui: { json: vi.fn(), warn: vi.fn(), error: vi.fn() } };
}

describe('confirmDestructive', () => {
  it('returns null (proceed) when confirmed, emitting nothing', () => {
    const c = ctx();
    expect(confirmDestructive(c, { confirmed: true, action: ACTION })).toBeNull();
    expect(c.ui.json).not.toHaveBeenCalled();
    expect(c.ui.warn).not.toHaveBeenCalled();
  });

  it('blocks with exit 1 and warns the human when not confirmed', () => {
    const c = ctx();
    expect(confirmDestructive(c, { confirmed: false, isJson: false, action: ACTION })).toEqual({ exitCode: 1 });
    expect(c.ui.warn).toHaveBeenCalledTimes(1);
    expect(c.ui.json).not.toHaveBeenCalled();
  });

  it('emits a machine-readable signal in json mode (agent sees blast radius)', () => {
    const c = ctx();
    const res = confirmDestructive(c, { confirmed: false, isJson: true, action: ACTION });
    expect(res).toEqual({ exitCode: 1 });
    expect(c.ui.warn).not.toHaveBeenCalled();
    const sig = (c.ui.json as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(sig).toMatchObject({
      ok: false,
      confirmationRequired: true,
      destructive: true,
      irreversible: false,
      reversible: true,
      severity: 'high',
      action: 'mind drop',
      resource: 'index "code"',
      confirmWith: '--yes',
    });
    expect(sig.blastRadius).toEqual({ count: 100, unit: 'vectors', scope: 'whole index' });
    expect(sig.recovery).toBe('re-index from source');
    expect(String(sig.message)).toContain('mind drop');
  });

  it('marks irreversible actions and omits a recovery field when none', () => {
    const c = ctx();
    confirmDestructive(c, {
      confirmed: false,
      isJson: true,
      action: { ...ACTION, reversible: false, recovery: undefined },
    });
    const sig = (c.ui.json as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(sig.irreversible).toBe(true);
    expect('recovery' in sig).toBe(false);
  });

  it('falls back to ui.error when ui.warn is absent', () => {
    const c = { ui: { error: vi.fn() } };
    confirmDestructive(c, { confirmed: false, isJson: false, action: ACTION });
    expect(c.ui.error).toHaveBeenCalledTimes(1);
  });
});

describe('renderDestructiveMessage', () => {
  it('leads with [severity] + recovery when reversible', () => {
    const m = renderDestructiveMessage(ACTION);
    expect(m).toContain('[high]');
    expect(m).not.toContain('IRREVERSIBLE');
    expect(m).toContain('Recovery: re-index from source');
    expect(m).toContain('Confirm with --yes');
  });

  it('leads with IRREVERSIBLE + "No recovery" when not reversible', () => {
    const m = renderDestructiveMessage({ ...ACTION, reversible: false, recovery: undefined });
    expect(m).toContain('⚠ IRREVERSIBLE [high]');
    expect(m).toContain('No recovery — data is permanently lost');
  });

  it('renders blast radius (count · unit · scope)', () => {
    expect(renderDestructiveMessage(ACTION)).toContain('100 vectors · whole index');
  });

  it('honours a custom confirm flag', () => {
    expect(renderDestructiveMessage({ ...ACTION, confirmFlag: '--force' })).toContain('Confirm with --force');
  });
});
