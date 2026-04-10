/**
 * Tests for help generation with JSON and source/shadowed fields
 */

import { describe, it, expect } from 'vitest';
import { renderHelp } from '../../utils/help-generator';
import type { RegisteredCommand } from '../types';

describe('renderHelp', () => {
  const createMockCommand = (overrides: Partial<RegisteredCommand> = {}): RegisteredCommand => ({
    manifest: {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      loader: async () => ({ run: async () => 0 }),
    },
    available: true,
    source: 'workspace',
    shadowed: false,
    ...overrides,
  });

  it('should render text help by default', () => {
    const commands = [
      createMockCommand({ manifest: { ...createMockCommand().manifest, id: 'test:command1' } }),
      createMockCommand({ manifest: { ...createMockCommand().manifest, id: 'test:command2' } }),
    ];

    const result = renderHelp(commands, { json: false, onlyAvailable: false });

    expect(typeof result).toBe('string');
    expect(result).toContain('KB Labs CLI');
    expect(result).toContain('test command1');
    expect(result).toContain('test command2');
  });

  it('should render JSON help with source and shadowed fields', () => {
    const commands = [
      createMockCommand({
        manifest: { ...createMockCommand().manifest, id: 'test:command1' },
        source: 'workspace',
        shadowed: false,
      }),
      createMockCommand({
        manifest: { ...createMockCommand().manifest, id: 'test:command2' },
        source: 'node_modules',
        shadowed: true,
        available: false,
        unavailableReason: 'Missing dependency',
        hint: 'Run: kb devlink apply',
      }),
    ];

    const result = renderHelp(commands, { json: true, onlyAvailable: false });

    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('version');
    expect(result).toHaveProperty('groups');

    const groups = (result as any).groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('test');
    expect(groups[0].commands).toHaveLength(2);

    const cmd1 = groups[0].commands.find((c: any) => c.id === 'test:command1');
    expect(cmd1.available).toBe(true);
    expect(cmd1.source).toBe('workspace');
    expect(cmd1.shadowed).toBe(false);

    const cmd2 = groups[0].commands.find((c: any) => c.id === 'test:command2');
    expect(cmd2.available).toBe(false);
    expect(cmd2.source).toBe('node_modules');
    expect(cmd2.shadowed).toBe(true);
    expect(cmd2.reason).toBe('Missing dependency');
    expect(cmd2.hint).toBe('Run: kb devlink apply');
  });

  it('should filter unavailable commands when onlyAvailable is true', () => {
    const commands = [
      createMockCommand({
        manifest: { ...createMockCommand().manifest, id: 'test:command1' },
        available: true,
      }),
      createMockCommand({
        manifest: { ...createMockCommand().manifest, id: 'test:command2' },
        available: false,
        shadowed: false,
      }),
      createMockCommand({
        manifest: { ...createMockCommand().manifest, id: 'test:command3' },
        available: true,
        shadowed: true,
      }),
    ];

    const result = renderHelp(commands, { json: true, onlyAvailable: true });

    const groups = (result as any).groups;
    expect(groups[0].commands).toHaveLength(1);
    expect(groups[0].commands[0].id).toBe('test:command1');
  });

  it('should group commands by group name', () => {
    const commands = [
      createMockCommand({
        manifest: { ...createMockCommand().manifest, id: 'test:command1', group: 'test' },
      }),
      createMockCommand({
        manifest: { ...createMockCommand().manifest, id: 'other:command1', group: 'other' },
      }),
      createMockCommand({
        manifest: { ...createMockCommand().manifest, id: 'test:command2', group: 'test' },
      }),
    ];

    const result = renderHelp(commands, { json: true, onlyAvailable: false });

    const groups = (result as any).groups;
    expect(groups).toHaveLength(2);
    
    const testGroup = groups.find((g: any) => g.name === 'test');
    expect(testGroup.commands).toHaveLength(2);
    expect(testGroup.commands.map((c: any) => c.id)).toContain('test:command1');
    expect(testGroup.commands.map((c: any) => c.id)).toContain('test:command2');

    const otherGroup = groups.find((g: any) => g.name === 'other');
    expect(otherGroup.commands).toHaveLength(1);
    expect(otherGroup.commands[0].id).toBe('other:command1');
  });

  it('should sort commands within groups', () => {
    const commands = [
      createMockCommand({
        manifest: { ...createMockCommand().manifest, id: 'test:command2', group: 'test' },
      }),
      createMockCommand({
        manifest: { ...createMockCommand().manifest, id: 'test:command1', group: 'test' },
      }),
      createMockCommand({
        manifest: { ...createMockCommand().manifest, id: 'test:command3', group: 'test' },
      }),
    ];

    const result = renderHelp(commands, { json: true, onlyAvailable: false });

    const groups = (result as any).groups;
    const testGroup = groups.find((g: any) => g.name === 'test');
    const commandIds = testGroup.commands.map((c: any) => c.id);
    
    expect(commandIds).toEqual(['test:command1', 'test:command2', 'test:command3']);
  });

  it('should include aliases in JSON output', () => {
    const commands = [
      createMockCommand({
        manifest: {
          ...createMockCommand().manifest,
          id: 'test:command',
          aliases: ['test-command', 'tc'],
        },
      }),
    ];

    const result = renderHelp(commands, { json: true, onlyAvailable: false });

    const groups = (result as any).groups;
    const command = groups[0].commands[0];
    expect(command.aliases).toEqual(['test-command', 'tc']);
  });
});
