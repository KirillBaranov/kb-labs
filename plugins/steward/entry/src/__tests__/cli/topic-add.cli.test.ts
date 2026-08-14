import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  addTopic: vi.fn(),
}));

import { addTopic } from '@kb-labs/steward-core';
import command from '../../commands/topic-add.js';

const mockedAddTopic = vi.mocked(addTopic);

beforeEach(() => {
  mockedAddTopic.mockReset();
});

describe('steward:topic.add', () => {
  it('registers a topic with parsed aliases', async () => {
    mockedAddTopic.mockResolvedValue({
      id: 'top_1',
      name: 'frontend',
      aliases: ['фронт', 'фронтенд', 'front-end'],
      createdAt: 1,
      updatedAt: 1,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(
      ctx,
      mockCLIInput({ flags: { name: 'frontend', aliases: 'фронт,фронтенд,front-end' } }),
    );

    expect(result.ok).toBe(true);
    expect(mockedAddTopic).toHaveBeenCalledWith({ name: 'frontend', aliases: ['фронт', 'фронтенд', 'front-end'] });
    expect(captured.infos[0]?.message).toContain('frontend');
  });

  it('missing --name is a validation error', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_ARGS');
    }
    expect(mockedAddTopic).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
