import { describe, it, expect } from 'vitest';
import {
  cmd,
  group,
  mergeCliGroups,
  createManifest,
  GET,
  POST,
  PUT,
  PATCH,
  DELETE,
  CmdBuilder,
} from '../manifest-builder';

// ─── cmd() ────────────────────────────────────────────────────────────────────

describe('cmd()', () => {
  it('returns a CmdBuilder', () => {
    const builder = cmd('health', './commands/health.js#default', 'Check health.');
    expect(builder).toBeInstanceOf(CmdBuilder);
  });

  it('build() produces correct base fields', () => {
    const decl = cmd('health', './commands/health.js#default', 'Check health.').build();
    expect(decl.path).toBe('health');
    expect(decl.handler).toBe('./commands/health.js#default');
    expect(decl.describe).toBe('Check health.');
  });

  it('.read() sets operationType to literal "read" without as const', () => {
    const decl = cmd('health', './commands/health.js#default', 'Check health.').read().build();
    // Must be the narrow literal, not string
    expect(decl.operationType).toBe('read');
  });

  it('.mutate() sets operationType: mutate', () => {
    const decl = cmd('x', './x.js', 'X.').mutate().build();
    expect(decl.operationType).toBe('mutate');
  });

  it('.execute() sets operationType: execute', () => {
    const decl = cmd('x', './x.js', 'X.').execute().build();
    expect(decl.operationType).toBe('execute');
  });

  it('.analyze() sets operationType: analyze', () => {
    const decl = cmd('x', './x.js', 'X.').analyze().build();
    expect(decl.operationType).toBe('analyze');
  });

  it('.flags() calls defineCommandFlags internally and produces CliFlagDecl[]', () => {
    const def = {
      json: { type: 'boolean' as const, description: 'JSON output', default: false },
      limit: { type: 'number' as const, description: 'Max items', default: 10 },
    };
    const decl = cmd('x', './x.js', 'X.').flags(def).build();
    expect(Array.isArray(decl.flags)).toBe(true);
    expect(decl.flags).toHaveLength(2);
    expect(decl.flags?.[0]).toMatchObject({ name: 'json', type: 'boolean' });
    expect(decl.flags?.[1]).toMatchObject({ name: 'limit', type: 'number' });
  });

  it('.long() sets longDescription', () => {
    const decl = cmd('x', './x.js', 'X.').long('Detailed description.').build();
    expect(decl.longDescription).toBe('Detailed description.');
  });

  it('.examples() sets examples array', () => {
    const ex = ['kb x', 'kb x --json'];
    const decl = cmd('x', './x.js', 'X.').examples(ex).build();
    expect(decl.examples).toEqual(ex);
  });

  it('.category() sets category', () => {
    const decl = cmd('x', './x.js', 'X.').category('Daemon').build();
    expect(decl.category).toBe('Daemon');
  });

  it('.aliases() sets aliases', () => {
    const decl = cmd('x', './x.js', 'X.').aliases(['y', 'z']).build();
    expect(decl.aliases).toEqual(['y', 'z']);
  });

  it('.perms() sets permissions', () => {
    const spec = { network: { fetch: ['api.example.com'] } };
    const decl = cmd('x', './x.js', 'X.').perms(spec).build();
    expect(decl.permissions).toEqual(spec);
  });

  it('omits undefined optional fields from build() output', () => {
    const decl = cmd('x', './x.js', 'X.').build();
    expect('operationType' in decl).toBe(false);
    expect('longDescription' in decl).toBe(false);
    expect('flags' in decl).toBe(false);
    expect('examples' in decl).toBe(false);
    expect('category' in decl).toBe(false);
  });

  it('is chainable in any order', () => {
    const def = { json: { type: 'boolean' as const } };
    const decl = cmd('x', './x.js', 'X.')
      .examples(['kb x'])
      .flags(def)
      .category('Test')
      .read()
      .long('Long.')
      .build();
    expect(decl.operationType).toBe('read');
    expect(decl.category).toBe('Test');
    expect(decl.longDescription).toBe('Long.');
    expect(Array.isArray(decl.flags)).toBe(true);
  });
});

// ─── group() ──────────────────────────────────────────────────────────────────

describe('group()', () => {
  it('returns { meta, commands }', () => {
    const g = group({ path: 'workflow', describe: 'Workflow commands' }, [
      cmd('workflow health', './commands/health.js#default', 'Health.'),
    ]);
    expect(g.meta).toEqual({ path: 'workflow', describe: 'Workflow commands' });
    expect(g.commands).toHaveLength(1);
  });

  it('accepts both CmdBuilder and CliCommandDecl', () => {
    const plainDecl = {
      path: 'x',
      handler: './x.js',
      describe: 'X.',
    };
    const g = group({ path: 'x', describe: 'X group' }, [
      cmd('x health', './commands/health.js#default', 'Health.'),
      plainDecl,
    ]);
    expect(g.commands).toHaveLength(2);
  });

  it('applies group category to commands without their own category', () => {
    const g = group({ path: 'workflow', describe: 'Workflow', category: 'Daemon' }, [
      cmd('workflow health', './commands/health.js#default', 'Health.'),
      cmd('workflow metrics', './commands/metrics.js#default', 'Metrics.'),
    ]);
    expect(g.commands[0]!.category).toBe('Daemon');
    expect(g.commands[1]!.category).toBe('Daemon');
  });

  it('does not overwrite a command-level category with the group category', () => {
    const g = group({ path: 'workflow', describe: 'Workflow', category: 'Daemon' }, [
      cmd('workflow health', './commands/health.js#default', 'Health.').category('Custom'),
    ]);
    expect(g.commands[0]!.category).toBe('Custom');
  });

  it('does not set category if group meta has no category', () => {
    const g = group({ path: 'workflow', describe: 'Workflow' }, [
      cmd('workflow health', './commands/health.js#default', 'Health.'),
    ]);
    expect(g.commands[0]!.category).toBeUndefined();
  });
});

// ─── mergeCliGroups() ─────────────────────────────────────────────────────────

describe('mergeCliGroups()', () => {
  it('merges commands from all groups', () => {
    const g1 = group({ path: 'a', describe: 'A' }, [cmd('a x', './x.js', 'X.')]);
    const g2 = group({ path: 'b', describe: 'B' }, [cmd('b y', './y.js', 'Y.'), cmd('b z', './z.js', 'Z.')]);
    const cli = mergeCliGroups(g1, g2);
    expect(cli.commands).toHaveLength(3);
  });

  it('collects groupMeta from all groups', () => {
    const g1 = group({ path: 'a', describe: 'A group' }, [cmd('a x', './x.js', 'X.')]);
    const g2 = group({ path: 'b', describe: 'B group' }, [cmd('b y', './y.js', 'Y.')]);
    const cli = mergeCliGroups(g1, g2);
    expect(cli.groupMeta).toEqual([
      { path: 'a', describe: 'A group' },
      { path: 'b', describe: 'B group' },
    ]);
  });

  it('works with a single group', () => {
    const g = group({ path: 'a', describe: 'A' }, [cmd('a x', './x.js', 'X.')]);
    const cli = mergeCliGroups(g);
    expect(cli.commands).toHaveLength(1);
    expect(cli.groupMeta).toHaveLength(1);
  });

  it('produces correct structure for ManifestV3 cli field', () => {
    const g = group({ path: 'plugin', describe: 'Plugin commands' }, [
      cmd('plugin run', './commands/run.js#default', 'Run plugin.').execute(),
    ]);
    const cli = mergeCliGroups(g);
    expect(cli).toHaveProperty('commands');
    expect(cli).toHaveProperty('groupMeta');
    expect(cli.commands[0]!.operationType).toBe('execute');
  });
});

// ─── HTTP route helpers ───────────────────────────────────────────────────────

describe('HTTP route helpers (GET, POST, PUT, PATCH, DELETE)', () => {
  it('GET() injects method: GET', () => {
    const route = GET('/items', './rest/list.js#default');
    expect(route.method).toBe('GET');
    expect(route.path).toBe('/items');
    expect(route.handler).toBe('./rest/list.js#default');
  });

  it('POST() injects method: POST', () => {
    const route = POST('/items', './rest/create.js#default');
    expect(route.method).toBe('POST');
  });

  it('PUT() injects method: PUT', () => {
    expect(PUT('/items/1', './rest/update.js#default').method).toBe('PUT');
  });

  it('PATCH() injects method: PATCH', () => {
    expect(PATCH('/items/1', './rest/patch.js#default').method).toBe('PATCH');
  });

  it('DELETE() injects method: DELETE', () => {
    expect(DELETE('/items/1', './rest/delete.js#default').method).toBe('DELETE');
  });

  it('passes opts through to the route declaration', () => {
    const route = GET('/items', './rest/list.js#default', {
      description: 'List all items',
      timeoutMs: 5000,
      output: { zod: '@pkg#Schema' },
    });
    expect(route.description).toBe('List all items');
    expect(route.timeoutMs).toBe(5000);
    expect(route.output).toEqual({ zod: '@pkg#Schema' });
  });

  it('works without opts', () => {
    const route = POST('/submit', './rest/submit.js#default');
    expect(route.method).toBe('POST');
    expect(route.path).toBe('/submit');
    expect(route.description).toBeUndefined();
  });
});

// ─── createManifest() ─────────────────────────────────────────────────────────

describe('createManifest()', () => {
  it('injects schema: kb.plugin/3 automatically', () => {
    const m = createManifest('@kb-labs/test', '1.0.0', {});
    expect(m.schema).toBe('kb.plugin/3');
  });

  it('sets id and version from arguments', () => {
    const m = createManifest('@kb-labs/test', '2.3.4', {});
    expect(m.id).toBe('@kb-labs/test');
    expect(m.version).toBe('2.3.4');
  });

  it('spreads body fields into the manifest', () => {
    const m = createManifest('@kb-labs/test', '1.0.0', {
      display: { name: 'Test Plugin', description: 'A test plugin' },
    });
    expect(m.display?.name).toBe('Test Plugin');
  });

  it('produces a valid ManifestV3 with cli section from mergeCliGroups', () => {
    const g = group({ path: 'test', describe: 'Test commands', category: 'Test' }, [
      cmd('test run', './commands/run.js#default', 'Run test.').execute(),
    ]);
    const m = createManifest('@kb-labs/test', '1.0.0', {
      cli: mergeCliGroups(g),
    });
    expect(m.cli?.commands).toHaveLength(1);
    expect(m.cli?.groupMeta).toHaveLength(1);
    expect(m.cli?.commands[0]!.operationType).toBe('execute');
    expect(m.cli?.commands[0]!.category).toBe('Test');
  });

  it('produces a valid ManifestV3 with rest routes from GET/POST', () => {
    const m = createManifest('@kb-labs/test', '1.0.0', {
      rest: {
        basePath: '/v1/plugins/test',
        routes: [
          GET('/items', './rest/list.js#default', { description: 'List items' }),
          POST('/items', './rest/create.js#default', { description: 'Create item' }),
        ],
      },
    });
    expect(m.rest?.routes).toHaveLength(2);
    expect(m.rest?.routes[0]!.method).toBe('GET');
    expect(m.rest?.routes[1]!.method).toBe('POST');
  });
});
