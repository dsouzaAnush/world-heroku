import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

import { createWorld } from '../src/index.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('TEST_DATABASE_URL is required for integration tests.');
}

function releaseCheck() {
  return spawnSync(process.execPath, ['bin/release-check.js', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      WORKFLOW_HEROKU_RELEASE_POLICY: 'block',
    },
  });
}

it('blocks releases with active runs and passes after they drain', async () => {
  const world = createWorld({ connectionString });
  let runId: string | undefined;

  try {
    const created = await world.events.create(null, {
      eventType: 'run_created',
      eventData: {
        deploymentId: 'release-check-test',
        input: new Uint8Array(),
        workflowName: 'release-check-test',
      },
    });
    runId = created.run?.runId;
    expect(runId).toBeTruthy();

    const blocked = releaseCheck();
    expect(blocked.status).toBe(1);
    expect(JSON.parse(blocked.stdout)).toMatchObject({
      activeRuns: { total: 1 },
      policy: 'block',
      safe: false,
    });

    await world.events.create(runId as string, {
      eventType: 'run_cancelled',
    });

    const passed = releaseCheck();
    expect(passed.status).toBe(0);
    expect(JSON.parse(passed.stdout)).toMatchObject({
      activeRuns: { total: 0 },
      safe: true,
    });
  } finally {
    if (runId) {
      await world.events
        .create(runId, { eventType: 'run_cancelled' })
        .catch(() => {});
    }
    await world.close?.();
  }
});
