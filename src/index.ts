import {
  createWorld as createPostgresWorld,
  type PostgresWorldConfig,
} from '@workflow/world-postgres';

const DEFAULT_QUEUE_CONCURRENCY = 10;
const DEFAULT_MAX_POOL_SIZE = 10;

/** A Workflow World configured for Heroku's long-lived process model. */
export type HerokuWorld = ReturnType<typeof createPostgresWorld>;

/**
 * Programmatic configuration accepted by the underlying Postgres World.
 *
 * When omitted, {@link createWorld} resolves Heroku config vars with
 * {@link resolveHerokuWorldConfig}.
 */
export type HerokuWorldConfig = PostgresWorldConfig;

function firstNonEmpty(
  environment: NodeJS.ProcessEnv,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = environment[key]?.trim();
    if (value) return value;
  }

  return undefined;
}

function positiveInteger(
  environment: NodeJS.ProcessEnv,
  keys: string[],
  fallback: number,
): number {
  const value = firstNonEmpty(environment, ...keys);
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(
      `${keys[0]} must be a positive integer; received ${JSON.stringify(value)}.`,
    );
  }

  return parsed;
}

/**
 * Resolve the zero-argument World's configuration from Heroku config vars.
 *
 * Heroku-specific names take precedence. The upstream Postgres World names
 * remain supported so an existing Postgres World application can migrate
 * without renaming all of its config vars.
 */
export function resolveHerokuWorldConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PostgresWorldConfig {
  const connectionString = firstNonEmpty(
    environment,
    'WORKFLOW_HEROKU_POSTGRES_URL',
    'WORKFLOW_POSTGRES_URL',
    'DATABASE_URL',
  );

  if (!connectionString) {
    throw new Error(
      'Heroku World requires WORKFLOW_HEROKU_POSTGRES_URL, WORKFLOW_POSTGRES_URL, or DATABASE_URL. Attach Heroku Postgres or provide an explicit createWorld({ connectionString }) configuration.',
    );
  }

  return {
    connectionString,
    jobPrefix: firstNonEmpty(
      environment,
      'WORKFLOW_HEROKU_JOB_PREFIX',
      'WORKFLOW_POSTGRES_JOB_PREFIX',
    ),
    queueConcurrency: positiveInteger(
      environment,
      [
        'WORKFLOW_HEROKU_WORKER_CONCURRENCY',
        'WORKFLOW_POSTGRES_WORKER_CONCURRENCY',
      ],
      DEFAULT_QUEUE_CONCURRENCY,
    ),
    maxPoolSize: positiveInteger(
      environment,
      ['WORKFLOW_HEROKU_MAX_POOL_SIZE', 'WORKFLOW_POSTGRES_MAX_POOL_SIZE'],
      DEFAULT_MAX_POOL_SIZE,
    ),
  };
}

/**
 * Create a Heroku World.
 *
 * With no arguments, configuration is read from Heroku config vars. Passing a
 * config object delegates directly to the official Postgres World and is
 * useful for custom connection pools or local tests.
 */
export function createWorld(config?: HerokuWorldConfig): HerokuWorld {
  return createPostgresWorld(config ?? resolveHerokuWorldConfig());
}

export type { PostgresWorldConfig } from '@workflow/world-postgres';
export * from '@workflow/world-postgres/schema';
