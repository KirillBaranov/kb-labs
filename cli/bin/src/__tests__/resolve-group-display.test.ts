/**
 * Regression tests for resolveGroupDisplay.
 *
 * Background: `kb info` used to render "info groups: info" (a one-item list
 * of groups) instead of showing the commands inside the info group. Root
 * cause was that getGroupsByPrefix('info') returns the info group itself
 * (prefix match covers both `name === prefix` and `name.startsWith(prefix+':')`),
 * and the rendering path treated any non-empty result as "list of groups".
 *
 * resolveGroupDisplay now makes the exact-vs-list decision explicit and pure.
 */

import { describe, it, expect } from 'vitest';
import { resolveGroupDisplay } from '../runtime/bootstrap';

const makeGroup = (name: string, commands: Array<{ name: string }> = []) => ({
  name,
  describe: `${name} group`,
  commands,
});

describe('resolveGroupDisplay', () => {
  it('returns `exact` when prefix equals a group name (kb info regression)', () => {
    const info = makeGroup('info', [{ name: 'hello' }, { name: 'version' }]);
    const decision = resolveGroupDisplay('info', [info]);

    expect(decision.kind).toBe('exact');
    if (decision.kind === 'exact') {
      expect(decision.group).toBe(info);
      expect(decision.group.commands).toHaveLength(2);
    }
  });

  it('returns `exact` even when subgroups are also present', () => {
    // marketplace is both a group itself and has `marketplace:plugins`,
    // `marketplace:adapters` as subgroups.
    const marketplace = makeGroup('marketplace', [{ name: 'install' }]);
    const plugins = makeGroup('marketplace:plugins', [{ name: 'list' }]);
    const adapters = makeGroup('marketplace:adapters', [{ name: 'list' }]);

    const decision = resolveGroupDisplay('marketplace', [marketplace, plugins, adapters]);

    expect(decision.kind).toBe('exact');
    if (decision.kind === 'exact') {
      expect(decision.group.name).toBe('marketplace');
    }
  });

  it('returns `list` when prefix only matches subgroups (no exact match)', () => {
    // `kb mp` — user typed a prefix that doesn't equal any group name, but
    // some subgroups happen to start with it. This path was unaffected by
    // the bug but is validated here to document expected behavior.
    const plugins = makeGroup('mp:plugins', []);
    const adapters = makeGroup('mp:adapters', []);

    const decision = resolveGroupDisplay('mp', [plugins, adapters]);

    expect(decision.kind).toBe('list');
    if (decision.kind === 'list') {
      expect(decision.groups).toHaveLength(2);
      expect(decision.groups.map((g) => g.name)).toEqual(['mp:plugins', 'mp:adapters']);
    }
  });

  it('returns `list` with a single entry when that entry is a subgroup, not the exact group', () => {
    const sub = makeGroup('info:extra', []);
    const decision = resolveGroupDisplay('info', [sub]);

    expect(decision.kind).toBe('list');
  });
});
