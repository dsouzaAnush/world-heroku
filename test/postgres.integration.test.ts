import { expect, it } from 'vitest';
import { createWorld } from '../src/index.js';

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error('TEST_DATABASE_URL is required for integration tests.');
}

it('starts, reads from, and closes the Postgres-backed World', async () => {
  const world = createWorld({
    connectionString,
    maxPoolSize: 4,
    queueConcurrency: 2,
  });

  try {
    await world.start();
    const result = await world.runs.list();
    expect(result.data).toBeInstanceOf(Array);
    expect(result.hasMore).toBe(false);
  } finally {
    await world.close?.();
  }
});
