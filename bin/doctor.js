#!/usr/bin/env node

try {
  process.loadEnvFile();
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
let world;

function optionalPositiveInteger(name) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer; received ${value}.`);
  }
  return parsed;
}

try {
  const {
    calculateHerokuCapacity,
    createWorld,
    inspectActiveRuns,
    resolveHerokuWorldConfig,
  } = await import('../dist/index.js');
  const config = resolveHerokuWorldConfig();
  world = createWorld(config);
  await world.runs.list({ pagination: { limit: 1 }, resolveData: 'none' });
  const activeRuns = await inspectActiveRuns(world);
  const warnings = [];

  if (!config.encryptionKey) {
    warnings.push('Workflow payload encryption is not configured.');
  }
  if (!config.namespace) {
    warnings.push('A queue namespace is not configured.');
  }
  if (!config.jobPrefix) {
    warnings.push('A Graphile Worker job prefix is not configured.');
  }
  if (!process.env.WORKFLOW_HEROKU_API_TOKEN?.trim()) {
    warnings.push('The example application API token is not configured.');
  }
  if (process.env.NODE_ENV !== 'production') {
    warnings.push('NODE_ENV is not set to production.');
  }

  const databaseConnectionLimit = optionalPositiveInteger(
    'WORKFLOW_HEROKU_DATABASE_CONNECTION_LIMIT',
  );
  const processes = optionalPositiveInteger('WORKFLOW_HEROKU_PROCESS_COUNT');
  const applicationPoolSize =
    optionalPositiveInteger('WORKFLOW_HEROKU_APPLICATION_POOL_SIZE') ?? 0;
  let capacity = null;
  if (databaseConnectionLimit && processes) {
    capacity = calculateHerokuCapacity({
      applicationPoolSize,
      databaseConnectionLimit,
      processes,
      workflowPoolSize: config.maxPoolSize ?? 10,
    });
    if (!capacity.safe) {
      warnings.push(
        `The declared formation can require ${capacity.requiredConnections} connections but the database limit is ${capacity.databaseConnectionLimit}.`,
      );
    }
  } else {
    warnings.push(
      'Set WORKFLOW_HEROKU_DATABASE_CONNECTION_LIMIT and WORKFLOW_HEROKU_PROCESS_COUNT to validate connection capacity.',
    );
  }

  const report = {
    activeRuns,
    capacity,
    configuration: {
      apiTokenConfigured: Boolean(
        process.env.WORKFLOW_HEROKU_API_TOKEN?.trim(),
      ),
      encryptionConfigured: Boolean(config.encryptionKey),
      jobPrefix: config.jobPrefix ?? null,
      maxPoolSize: config.maxPoolSize ?? null,
      namespace: config.namespace ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
      queueConcurrency: config.queueConcurrency ?? null,
    },
    releaseVersion: process.env.HEROKU_RELEASE_VERSION ?? null,
    status: warnings.length === 0 ? 'ok' : 'warning',
    storage: 'healthy',
    warnings,
  };
  console.log(JSON.stringify(report, null, 2));
  if (strict && warnings.length > 0) process.exitCode = 1;
} catch (error) {
  console.error('[heroku-world] Doctor failed:', error);
  process.exitCode = 1;
} finally {
  await world?.close?.();
}
