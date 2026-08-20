import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPostgresWorld: vi.fn(() => ({ adapter: 'postgres' })),
}));

vi.mock('@workflow/world-postgres', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@workflow/world-postgres')>()),
  createWorld: mocks.createPostgresWorld,
}));

import { createWorld, resolveHerokuWorldConfig } from '../src/index.js';

describe('resolveHerokuWorldConfig', () => {
  it('uses Heroku config vars and conservative embedded-worker defaults', () => {
    expect(
      resolveHerokuWorldConfig({
        DATABASE_URL: 'postgres://database.example/workflows',
      }),
    ).toEqual({
      connectionString: 'postgres://database.example/workflows',
      jobPrefix: undefined,
      maxPoolSize: 10,
      queueConcurrency: 10,
    });
  });

  it('prefers adapter variables while accepting upstream fallbacks', () => {
    expect(
      resolveHerokuWorldConfig({
        DATABASE_URL: 'postgres://database.example/default',
        WORKFLOW_HEROKU_JOB_PREFIX: 'payments',
        WORKFLOW_HEROKU_MAX_POOL_SIZE: '14',
        WORKFLOW_QUEUE_NAMESPACE: 'payments',
        WORKFLOW_HEROKU_POSTGRES_URL:
          'postgres://database.example/heroku-world',
        WORKFLOW_HEROKU_WORKER_CONCURRENCY: '12',
        WORKFLOW_POSTGRES_JOB_PREFIX: 'ignored',
        WORKFLOW_POSTGRES_MAX_POOL_SIZE: '20',
        WORKFLOW_POSTGRES_URL: 'postgres://database.example/upstream',
        WORKFLOW_POSTGRES_WORKER_CONCURRENCY: '18',
      }),
    ).toEqual({
      connectionString: 'postgres://database.example/heroku-world',
      jobPrefix: 'payments',
      maxPoolSize: 14,
      namespace: 'payments',
      queueConcurrency: 12,
    });
  });

  it('configures payload encryption only when key and context are paired', () => {
    expect(
      resolveHerokuWorldConfig({
        DATABASE_URL: 'postgres://database.example/workflows',
        WORKFLOW_HEROKU_ENCRYPTION_CONTEXT: 'app-123',
        WORKFLOW_HEROKU_ENCRYPTION_KEY: '00'.repeat(32),
      }),
    ).toMatchObject({
      encryptionContext: 'app-123',
      encryptionKey: '00'.repeat(32),
    });

    expect(() =>
      resolveHerokuWorldConfig({
        DATABASE_URL: 'postgres://database.example/workflows',
        WORKFLOW_HEROKU_ENCRYPTION_KEY: '00'.repeat(32),
      }),
    ).toThrow('must be configured together');
  });

  it('validates the upstream queue namespace contract early', () => {
    expect(() =>
      resolveHerokuWorldConfig({
        DATABASE_URL: 'postgres://database.example/workflows',
        WORKFLOW_QUEUE_NAMESPACE: 'Invalid-Prefix',
      }),
    ).toThrow('must be lowercase alphanumeric');
  });

  it('fails fast instead of silently using a local development database', () => {
    expect(() => resolveHerokuWorldConfig({})).toThrow(
      'Heroku World requires WORKFLOW_HEROKU_POSTGRES_URL',
    );
  });

  it.each([
    ['WORKFLOW_HEROKU_WORKER_CONCURRENCY', '0'],
    ['WORKFLOW_HEROKU_WORKER_CONCURRENCY', '1.5'],
    ['WORKFLOW_HEROKU_MAX_POOL_SIZE', 'many'],
  ])('rejects invalid %s values', (key, value) => {
    expect(() =>
      resolveHerokuWorldConfig({
        DATABASE_URL: 'postgres://database.example/workflows',
        [key]: value,
      }),
    ).toThrow(`${key} must be a positive integer`);
  });
});

describe('createWorld', () => {
  it('delegates explicit configuration to the official Postgres World', () => {
    const config = {
      connectionString: 'postgres://world:world@localhost:5432/world',
    };

    expect(createWorld(config)).toEqual({ adapter: 'postgres' });
    expect(mocks.createPostgresWorld).toHaveBeenCalledWith(config);
  });

  it('adds official World encryption without forwarding adapter-only config', async () => {
    const world = createWorld({
      connectionString: 'postgres://world:world@localhost:5432/world',
      encryptionContext: 'app-123',
      encryptionKey: '00'.repeat(32),
    });

    expect(mocks.createPostgresWorld).toHaveBeenLastCalledWith({
      connectionString: 'postgres://world:world@localhost:5432/world',
    });
    await expect(
      world.getEncryptionKeyForRun?.('wrun_123'),
    ).resolves.toHaveLength(32);
  });
});
