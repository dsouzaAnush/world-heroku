import {
  createWorld as createPostgresWorld,
  type PostgresWorldConfig,
} from '@workflow/world-postgres';
import {
  createGetEncryptionKeyForRun,
  type EncryptionKeyMaterial,
} from './encryption.js';

const DEFAULT_QUEUE_CONCURRENCY = 10;
const DEFAULT_MAX_POOL_SIZE = 10;
const QUEUE_NAMESPACE_PATTERN = /^[a-z][a-z0-9]*$/;

export interface HerokuEncryptionConfig {
  /** A 32-byte master key encoded as hexadecimal, base64, or base64url. */
  encryptionKey?: EncryptionKeyMaterial;
  /** Stable, unique application context used for per-run HKDF isolation. */
  encryptionContext?: string;
}

/** A Workflow World configured for Heroku's long-lived process model. */
export type HerokuWorld = ReturnType<typeof createPostgresWorld>;

/**
 * Programmatic configuration accepted by the underlying Postgres World.
 *
 * When omitted, {@link createWorld} resolves Heroku config vars with
 * {@link resolveHerokuWorldConfig}.
 */
export type HerokuWorldConfig = PostgresWorldConfig & HerokuEncryptionConfig;

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
): HerokuWorldConfig {
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

  const encryptionKey = firstNonEmpty(
    environment,
    'WORKFLOW_HEROKU_ENCRYPTION_KEY',
  );
  const encryptionContext = firstNonEmpty(
    environment,
    'WORKFLOW_HEROKU_ENCRYPTION_CONTEXT',
  );
  if (Boolean(encryptionKey) !== Boolean(encryptionContext)) {
    throw new Error(
      'WORKFLOW_HEROKU_ENCRYPTION_KEY and WORKFLOW_HEROKU_ENCRYPTION_CONTEXT must be configured together.',
    );
  }

  const namespace = firstNonEmpty(environment, 'WORKFLOW_QUEUE_NAMESPACE');
  if (namespace && !QUEUE_NAMESPACE_PATTERN.test(namespace)) {
    throw new Error(
      `WORKFLOW_QUEUE_NAMESPACE must be lowercase alphanumeric and start with a letter; received ${JSON.stringify(namespace)}.`,
    );
  }

  return {
    connectionString,
    ...(encryptionContext ? { encryptionContext } : {}),
    ...(encryptionKey ? { encryptionKey } : {}),
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
    ...(namespace ? { namespace } : {}),
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
  const resolved = config ?? resolveHerokuWorldConfig();
  const { encryptionContext, encryptionKey, ...postgresConfig } = resolved;
  if (Boolean(encryptionKey) !== Boolean(encryptionContext)) {
    throw new Error(
      'encryptionKey and encryptionContext must be configured together.',
    );
  }

  const world = createPostgresWorld(postgresConfig as PostgresWorldConfig);
  if (!encryptionKey || !encryptionContext) return world;

  world.getEncryptionKeyForRun = createGetEncryptionKeyForRun(
    encryptionKey,
    encryptionContext,
  );
  return world;
}

export type { PostgresWorldConfig } from '@workflow/world-postgres';
export * from '@workflow/world-postgres/schema';
export * from './capacity.js';
export * from './encryption.js';
export * from './release.js';
export * from './security.js';
