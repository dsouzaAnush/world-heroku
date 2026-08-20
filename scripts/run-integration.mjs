#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const POSTGRES_IMAGE = 'postgres:18-alpine';
const POSTGRES_USER = 'world';
const POSTGRES_PASSWORD = 'world';
const POSTGRES_DATABASE = 'world';

function run(command, args, options = {}) {
  const { capture = false, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    ...spawnOptions,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = capture
      ? `\n${result.stdout ?? ''}${result.stderr ?? ''}`
      : '';
    throw new Error(
      `${command} ${args.join(' ')} exited with status ${result.status}.${details}`,
    );
  }

  return result.stdout?.trim();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function startPostgres() {
  run('docker', ['info'], { capture: true });

  const containerName = `heroku-world-test-${randomUUID()}`;
  let started = false;

  try {
    run(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--publish',
        '127.0.0.1::5432',
        '--env',
        `POSTGRES_USER=${POSTGRES_USER}`,
        '--env',
        `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
        '--env',
        `POSTGRES_DB=${POSTGRES_DATABASE}`,
        POSTGRES_IMAGE,
      ],
      { capture: true },
    );
    started = true;

    const publishedAddress = run(
      'docker',
      ['port', containerName, '5432/tcp'],
      { capture: true },
    );
    const port = publishedAddress?.match(/:(\d+)$/)?.[1];
    if (!port) {
      throw new Error(
        `Could not resolve PostgreSQL port from ${publishedAddress}.`,
      );
    }

    for (let attempt = 1; attempt <= 60; attempt += 1) {
      const ready = spawnSync(
        'docker',
        [
          'exec',
          containerName,
          'pg_isready',
          '--username',
          POSTGRES_USER,
          '--dbname',
          POSTGRES_DATABASE,
        ],
        { stdio: 'ignore' },
      );
      if (ready.status === 0) {
        return {
          connectionString: `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${port}/${POSTGRES_DATABASE}`,
          containerName,
        };
      }
      await sleep(500);
    }

    throw new Error('PostgreSQL did not become ready within 30 seconds.');
  } catch (error) {
    if (started) {
      spawnSync('docker', ['stop', containerName], { stdio: 'ignore' });
    }
    throw error;
  }
}

const suppliedConnectionString = process.env.TEST_DATABASE_URL?.trim();
let containerName;

try {
  let connectionString = suppliedConnectionString;
  if (!connectionString) {
    console.log(`Starting isolated ${POSTGRES_IMAGE} for integration tests...`);
    const postgres = await startPostgres();
    connectionString = postgres.connectionString;
    containerName = postgres.containerName;
  }

  const environment = {
    ...process.env,
    DATABASE_URL: connectionString,
    TEST_DATABASE_URL: connectionString,
    WORKFLOW_HEROKU_POSTGRES_URL: connectionString,
    WORKFLOW_POSTGRES_URL: connectionString,
    WORKFLOW_TARGET_WORLD: '@anushdsouza/world-heroku',
  };

  console.log('Bootstrapping Workflow schema twice to verify idempotency...');
  run(process.execPath, ['bin/bootstrap.js'], { env: environment });
  run(process.execPath, ['bin/bootstrap.js'], { env: environment });

  run(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      'vitest.integration.config.ts',
    ],
    { env: environment },
  );
} finally {
  if (containerName) {
    console.log(`Stopping isolated PostgreSQL container ${containerName}...`);
    spawnSync('docker', ['stop', containerName], { stdio: 'inherit' });
  }
}
