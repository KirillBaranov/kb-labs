import { describe, it, expect } from 'vitest';
import { extractEntityKinds } from '../discovery-manager.js';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';

function makeManifest(overrides: Partial<ManifestV3> = {}): ManifestV3 {
  return {
    schema: 'kb.plugin/3' as const,
    id: '@kb-labs/test',
    version: '1.0.0',
    ...overrides,
  } as ManifestV3;
}

describe('extractEntityKinds', () => {
  it('always includes "plugin" as base kind', () => {
    const kinds = extractEntityKinds(makeManifest());
    expect(kinds).toContain('plugin');
  });

  it('detects cli-command from manifest.cli.commands', () => {
    const kinds = extractEntityKinds(makeManifest({
      cli: { commands: [{ id: 'hello', describe: 'hi', handler: './h.js' }] },
    } as any));
    expect(kinds).toContain('cli-command');
  });

  it('detects rest-route from manifest.rest.routes', () => {
    const kinds = extractEntityKinds(makeManifest({
      rest: { routes: [{ method: 'GET', path: '/api/test', handler: './r.js' }] },
    } as any));
    expect(kinds).toContain('rest-route');
  });

  it('detects ws-channel from manifest.ws.channels', () => {
    const kinds = extractEntityKinds(makeManifest({
      ws: { channels: [{ id: 'events' }] },
    } as any));
    expect(kinds).toContain('ws-channel');
  });

  it('detects workflow from manifest.workflows.handlers', () => {
    const kinds = extractEntityKinds(makeManifest({
      workflows: { handlers: [{ id: 'deploy' }] },
    } as any));
    expect(kinds).toContain('workflow');
  });

  it('detects webhook from manifest.webhooks.handlers', () => {
    const kinds = extractEntityKinds(makeManifest({
      webhooks: { handlers: [{ id: 'gh-hook' }] },
    } as any));
    expect(kinds).toContain('webhook');
  });

  it('detects job from manifest.jobs.handlers', () => {
    const kinds = extractEntityKinds(makeManifest({
      jobs: { handlers: [{ id: 'cleanup' }] },
    } as any));
    expect(kinds).toContain('job');
  });

  it('detects cron from manifest.cron.schedules', () => {
    const kinds = extractEntityKinds(makeManifest({
      cron: { schedules: [{ id: 'daily', cron: '0 0 * * *' }] },
    } as any));
    expect(kinds).toContain('cron');
  });

  it('detects studio-widget from manifest.studio.pages', () => {
    const kinds = extractEntityKinds(makeManifest({
      studio: { pages: [{ id: 'dashboard' }] },
    } as any));
    expect(kinds).toContain('studio-widget');
  });

  it('detects studio-menu from manifest.studio.menus', () => {
    const kinds = extractEntityKinds(makeManifest({
      studio: { menus: [{ id: 'tools' }] },
    } as any));
    expect(kinds).toContain('studio-menu');
  });

  it('returns multiple kinds for rich manifest', () => {
    const kinds = extractEntityKinds(makeManifest({
      cli: { commands: [{ id: 'run', describe: 'r', handler: './r.js' }] },
      rest: { routes: [{ method: 'GET', path: '/', handler: './h.js' }] },
      cron: { schedules: [{ id: 'nightly', cron: '0 2 * * *' }] },
    } as any));

    expect(kinds).toContain('plugin');
    expect(kinds).toContain('cli-command');
    expect(kinds).toContain('rest-route');
    expect(kinds).toContain('cron');
    expect(kinds).toHaveLength(4);
  });

  it('does not detect kind when array is empty', () => {
    const kinds = extractEntityKinds(makeManifest({
      cli: { commands: [] },
      rest: { routes: [] },
    } as any));

    expect(kinds).toEqual(['plugin']);
  });
});
