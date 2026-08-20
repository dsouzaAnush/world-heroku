import { describe, expect, it, vi } from 'vitest';

import { inspectActiveRuns } from '../src/release.js';

describe('release drain inspection', () => {
  it('paginates pending and running runs without resolving payloads', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        cursor: 'pending-next',
        data: [{ runId: 'one', status: 'pending', workflowName: 'first' }],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        cursor: null,
        data: [{ runId: 'two', status: 'pending', workflowName: 'second' }],
        hasMore: false,
      })
      .mockResolvedValueOnce({
        cursor: null,
        data: [{ runId: 'three', status: 'running', workflowName: 'third' }],
        hasMore: false,
      });

    await expect(
      inspectActiveRuns({ runs: { list } }, { pageSize: 1, sampleSize: 2 }),
    ).resolves.toEqual({
      pending: 2,
      running: 1,
      sample: [
        { runId: 'one', status: 'pending', workflowName: 'first' },
        { runId: 'two', status: 'pending', workflowName: 'second' },
      ],
      total: 3,
    });
    expect(list).toHaveBeenNthCalledWith(2, {
      pagination: { cursor: 'pending-next', limit: 1 },
      resolveData: 'none',
      status: 'pending',
    });
  });
});
