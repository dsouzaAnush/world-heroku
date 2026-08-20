#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demo = join(root, 'examples', 'heroku-button');
const POSTGRES_IMAGE =
  process.env.TEST_POSTGRES_IMAGE?.trim() || 'postgres:18-alpine';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: options.capture ? 'pipe' : 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = options.capture
      ? `\n${result.stdout ?? ''}${result.stderr ?? ''}`
      : '';
    throw new Error(
      `${command} ${args.join(' ')} exited with status ${result.status}.${details}`,
    );
  }

  return result.stdout?.trim();
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

async function availablePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a test port.'));
        return;
      }
      server.close(() => resolvePromise(address.port));
    });
  });
}

async function startPostgres() {
  run('docker', ['info'], { capture: true });
  const containerName = `heroku-button-test-${randomUUID()}`;
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
        '--tmpfs',
        '/var/lib/postgresql/data:rw,size=512m',
        '--env',
        'POSTGRES_USER=world',
        '--env',
        'POSTGRES_PASSWORD=world',
        '--env',
        'POSTGRES_DB=world',
        POSTGRES_IMAGE,
      ],
      { capture: true },
    );
    started = true;

    const address = run('docker', ['port', containerName, '5432/tcp'], {
      capture: true,
    });
    const port = address?.match(/:(\d+)$/)?.[1];
    if (!port) {
      throw new Error(`Could not resolve PostgreSQL port from ${address}.`);
    }

    for (let attempt = 1; attempt <= 60; attempt += 1) {
      const ready = spawnSync(
        'docker',
        [
          'exec',
          containerName,
          'pg_isready',
          '--username',
          'world',
          '--dbname',
          'world',
        ],
        { stdio: 'ignore' },
      );
      if (ready.status === 0) {
        return {
          connectionString: `postgres://world:world@127.0.0.1:${port}/world`,
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

async function validateDeploymentContract() {
  const manifest = JSON.parse(await readFile(join(root, 'app.json'), 'utf8'));
  const procfile = await readFile(join(root, 'Procfile'), 'utf8');
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  const packageManifest = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8'),
  );

  const assertions = [
    [
      manifest.repository === 'https://github.com/dsouzaAnush/world-heroku',
      'repository',
    ],
    [manifest.success_url === '/', 'success_url'],
    [manifest.stack === 'heroku-24', 'stack'],
    [
      manifest.addons?.[0]?.plan === 'heroku-postgresql:essential-0',
      'Postgres add-on',
    ],
    [manifest.formation?.web?.quantity === 1, 'single web dyno'],
    [manifest.formation?.web?.size === 'basic', 'Basic dyno'],
    [
      manifest.env?.WORKFLOW_TARGET_WORLD?.value ===
        '@anushdsouza/world-heroku',
      'World target',
    ],
    [
      procfile.includes('release:') &&
        procfile.includes('workflow-heroku-bootstrap'),
      'release phase',
    ],
    [
      procfile.includes('web: npm --prefix examples/heroku-button start'),
      'web process',
    ],
    [
      readme.includes(
        'https://www.heroku.com/deploy?template=https://github.com/dsouzaAnush/world-heroku',
      ),
      'README button',
    ],
    [
      !packageManifest.files.includes('examples'),
      'demo excluded from npm package',
    ],
  ];

  for (const [passed, label] of assertions) {
    if (!passed) throw new Error(`Invalid Heroku Button contract: ${label}.`);
  }
}

async function waitForJson(url, predicate, attempts = 80) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      if (predicate(body)) return body;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}. Last error: ${lastError}`);
}

await validateDeploymentContract();
console.log(
  'Heroku app.json, Procfile, README button, and package boundary are valid.',
);

run('npm', ['ci', '--ignore-scripts', '--min-release-age=0'], { cwd: demo });
run('npm', ['run', 'typecheck'], { cwd: demo });
run('npm', ['run', 'build'], { cwd: demo });
run('npm', ['audit', '--omit=dev', '--audit-level=high'], { cwd: demo });

const installedPackage = JSON.parse(
  await readFile(
    join(demo, 'node_modules', '@anushdsouza', 'world-heroku', 'package.json'),
    'utf8',
  ),
);
const demoPackage = JSON.parse(
  await readFile(join(demo, 'package.json'), 'utf8'),
);
const expectedPackageVersion =
  demoPackage.dependencies['@anushdsouza/world-heroku'];
if (installedPackage.version !== expectedPackageVersion) {
  throw new Error(
    `Expected published World ${expectedPackageVersion}; got ${installedPackage.version}.`,
  );
}

let postgres;
let server;
const logs = [];

try {
  const suppliedDatabase = process.env.TEST_DATABASE_URL?.trim();
  postgres = suppliedDatabase
    ? { connectionString: suppliedDatabase }
    : await startPostgres();

  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const environment = {
    ...process.env,
    DATABASE_URL: postgres.connectionString,
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
    PORT: String(port),
    WORKFLOW_HEROKU_MAX_POOL_SIZE: '5',
    WORKFLOW_HEROKU_WORKER_CONCURRENCY: '2',
    WORKFLOW_LOCAL_BASE_URL: baseUrl,
    WORKFLOW_TARGET_WORLD: '@anushdsouza/world-heroku',
  };

  run('npm', ['exec', '--', 'workflow-heroku-bootstrap'], {
    cwd: demo,
    env: environment,
  });

  server = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: demo,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  server.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  const health = await waitForJson(
    `${baseUrl}/health`,
    (body) => body.status === 'ok',
  );
  if (
    health.world !== '@anushdsouza/world-heroku' ||
    health.databaseConfigured !== true
  ) {
    throw new Error(`Unexpected health response: ${JSON.stringify(health)}`);
  }

  const startedResponse = await fetch(`${baseUrl}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: 'Verified through the Heroku Button demo',
    }),
  });
  const started = await startedResponse.json();
  if (startedResponse.status !== 202 || !started.runId || !started.statusUrl) {
    throw new Error(`Unexpected start response: ${JSON.stringify(started)}`);
  }

  const completed = await waitForJson(
    `${baseUrl}${started.statusUrl}`,
    (body) => body.status === 'completed' || body.status === 'failed',
  );
  if (
    completed.status !== 'completed' ||
    completed.result?.message !== 'Verified through the Heroku Button demo' ||
    completed.result?.status !== 'completed'
  ) {
    throw new Error(`Unexpected workflow result: ${JSON.stringify(completed)}`);
  }

  console.log(
    `Heroku Button demo completed durable run ${started.runId} with published package ${installedPackage.version}.`,
  );
} catch (error) {
  if (logs.length > 0) {
    console.error('Demo server logs:\n', logs.join(''));
  }
  throw error;
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise((resolvePromise) => server.once('exit', resolvePromise)),
      sleep(5_000),
    ]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  if (postgres?.containerName) {
    spawnSync('docker', ['stop', postgres.containerName], { stdio: 'inherit' });
  }
}
