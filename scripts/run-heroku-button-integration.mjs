#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demo = join(root, 'examples', 'heroku-button');
const POSTGRES_IMAGE =
  process.env.TEST_POSTGRES_IMAGE?.trim() || 'postgres:18-alpine';
const { Client } = pg;
const rootPackageManifest = JSON.parse(
  await readFile(join(root, 'package.json'), 'utf8'),
);

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
      !rootPackageManifest.files.includes('examples'),
      'demo excluded from npm package',
    ],
  ];

  for (const [passed, label] of assertions) {
    if (!passed) throw new Error(`Invalid Heroku Button contract: ${label}.`);
  }
}

async function waitForJson(url, predicate, attempts = 80, init) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
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

async function assertEncryptedAtRest(connectionString, runId, plaintext) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT row_to_json(record)::text AS value
       FROM (
         SELECT * FROM workflow.workflow_runs WHERE id = $1
       ) AS record
       UNION ALL
       SELECT row_to_json(record)::text AS value
       FROM (
         SELECT * FROM workflow.workflow_events WHERE run_id = $1
       ) AS record
       UNION ALL
       SELECT row_to_json(record)::text AS value
       FROM (
         SELECT * FROM workflow.workflow_steps WHERE run_id = $1
       ) AS record`,
      [runId],
    );
    const stored = result.rows.map((row) => row.value).join('\n');
    if (stored.includes(plaintext)) {
      throw new Error('Workflow plaintext was found in Postgres storage.');
    }
    if (result.rows.length === 0) {
      throw new Error('No persisted workflow records were found.');
    }
  } finally {
    await client.end();
  }
}

function nonLoopbackIpv4Address() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal)
        return address.address;
    }
  }
  throw new Error('No non-loopback IPv4 interface is available for testing.');
}

async function requestWorkflowRouteFromNonWorker(host, port) {
  return new Promise((resolvePromise, reject) => {
    const req = request(
      {
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '127.0.0.1',
        },
        host,
        localAddress: host,
        method: 'POST',
        path: '/.well-known/workflow/v1/flow',
        port,
      },
      (response) => {
        response.resume();
        response.once('end', () => resolvePromise(response.statusCode));
      },
    );
    req.once('error', reject);
    req.end('{}');
  });
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
const expectedPackageVersion = rootPackageManifest.version;
if (installedPackage.version !== expectedPackageVersion) {
  throw new Error(
    `Expected repository World ${expectedPackageVersion}; got ${installedPackage.version}.`,
  );
}

let postgres;
const servers = [];
const logs = [];
let databasePaused = false;

function startServer(environment) {
  const child = spawn(process.execPath, ['start.mjs'], {
    cwd: demo,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = `[${environment.DYNO}] `;
  child.stdout.on('data', (chunk) => logs.push(`${prefix}${chunk.toString()}`));
  child.stderr.on('data', (chunk) => logs.push(`${prefix}${chunk.toString()}`));
  servers.push(child);
  return child;
}

async function stopServer(child, signal = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return false;
  child.kill(signal);
  await Promise.race([
    new Promise((resolvePromise) => child.once('exit', resolvePromise)),
    sleep(10_000),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    return true;
  }
  return false;
}

async function startScenario(
  baseUrl,
  authorization,
  scenario,
  payload,
  option,
) {
  const response = await fetch(`${baseUrl}/api/scenarios`, {
    method: 'POST',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ option, payload, scenario }),
  });
  const body = await response.json();
  if (response.status !== 202 || !body.runId || !body.statusUrl) {
    throw new Error(
      `Unexpected ${scenario} start response: ${JSON.stringify(body)}`,
    );
  }
  return body;
}

async function startCookbook(baseUrl, authorization, pattern) {
  const response = await fetch(`${baseUrl}/api/cookbook`, {
    method: 'POST',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ pattern }),
  });
  const body = await response.json();
  if (response.status !== 202 || !body.runId || !body.statusUrl) {
    throw new Error(
      `Unexpected ${pattern} cookbook response: ${JSON.stringify(body)}`,
    );
  }
  return body;
}

async function waitForTerminalRun(
  baseUrl,
  authorization,
  statusUrl,
  attempts = 120,
) {
  return waitForJson(
    `${baseUrl}${statusUrl}`,
    (body) => body.status === 'completed' || body.status === 'failed',
    attempts,
    { headers: authorization },
  );
}

try {
  const suppliedDatabase = process.env.TEST_DATABASE_URL?.trim();
  postgres = suppliedDatabase
    ? { connectionString: suppliedDatabase }
    : await startPostgres();

  const firstPort = await availablePort();
  const firstBaseUrl = `http://127.0.0.1:${firstPort}`;
  const commonEnvironment = {
    ...process.env,
    DATABASE_URL: postgres.connectionString,
    HOST: '0.0.0.0',
    NODE_ENV: 'production',
    WORKFLOW_HEROKU_API_TOKEN: 'heroku-button-test-token',
    WORKFLOW_HEROKU_DATABASE_CONNECTION_LIMIT: '20',
    WORKFLOW_HEROKU_ENCRYPTION_CONTEXT: 'heroku-button-test',
    WORKFLOW_HEROKU_ENCRYPTION_KEY: '11'.repeat(32),
    WORKFLOW_HEROKU_JOB_PREFIX: 'heroku_button_test_',
    WORKFLOW_HEROKU_MAX_POOL_SIZE: '4',
    WORKFLOW_HEROKU_PROCESS_COUNT: '2',
    WORKFLOW_HEROKU_WORKER_CONCURRENCY: '2',
    WORKFLOW_QUEUE_NAMESPACE: 'herokutest',
    WORKFLOW_TARGET_WORLD: '@anushdsouza/world-heroku',
  };
  const firstEnvironment = {
    ...commonEnvironment,
    DYNO: 'web.1',
    PORT: String(firstPort),
    WORKFLOW_LOCAL_BASE_URL: firstBaseUrl,
  };

  run('npm', ['exec', '--', 'workflow-heroku-bootstrap'], {
    cwd: demo,
    env: firstEnvironment,
  });

  const unsafeDoctor = spawnSync(
    process.execPath,
    [join(root, 'bin', 'doctor.js'), '--strict'],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...firstEnvironment,
        WORKFLOW_HEROKU_DATABASE_CONNECTION_LIMIT: '10',
      },
    },
  );
  if (unsafeDoctor.status === 0) {
    throw new Error('Doctor admitted an unsafe two-process connection budget.');
  }

  const firstServer = startServer(firstEnvironment);

  const health = await waitForJson(
    `${firstBaseUrl}/health`,
    (body) => body.status === 'ok',
  );
  if (
    health.world !== '@anushdsouza/world-heroku' ||
    health.storage !== 'healthy'
  ) {
    throw new Error(`Unexpected health response: ${JSON.stringify(health)}`);
  }

  const securePageResponse = await fetch(firstBaseUrl, {
    headers: { 'x-forwarded-proto': 'https' },
  });
  if (
    securePageResponse.status !== 200 ||
    securePageResponse.headers.get('strict-transport-security') !==
      'max-age=31536000'
  ) {
    throw new Error('Expected the Heroku HTTPS page to emit HSTS.');
  }

  const publicProtocolStatus = await requestWorkflowRouteFromNonWorker(
    nonLoopbackIpv4Address(),
    firstPort,
  );
  if (publicProtocolStatus !== 403) {
    throw new Error(
      `Expected a non-worker Workflow protocol request to return 403; received ${publicProtocolStatus}.`,
    );
  }

  const unauthorizedResponse = await fetch(`${firstBaseUrl}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-proto': 'https',
    },
    body: JSON.stringify({ message: 'This request must not start a run' }),
  });
  if (unauthorizedResponse.status !== 401) {
    throw new Error(
      `Expected an unauthorized API request to return 401; received ${unauthorizedResponse.status}.`,
    );
  }

  const authorization = {
    authorization: 'Bearer heroku-button-test-token',
    'x-forwarded-proto': 'https',
  };
  const insecureApiResponse = await fetch(`${firstBaseUrl}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'This request must use TLS' }),
  });
  if (insecureApiResponse.status !== 426) {
    throw new Error(
      `Expected a Heroku HTTP API request to return 426; received ${insecureApiResponse.status}.`,
    );
  }

  const workflowHealth = await waitForJson(
    `${firstBaseUrl}/api/health/workflow`,
    (body) => body.status === 'ok',
    120,
    { headers: authorization },
  );
  if (!workflowHealth.healthy) {
    throw new Error(
      `Unexpected Workflow health response: ${JSON.stringify(workflowHealth)}`,
    );
  }

  const startedResponse = await fetch(`${firstBaseUrl}/api/runs`, {
    method: 'POST',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: 'Verified through the Heroku Button demo',
    }),
  });
  const started = await startedResponse.json();
  if (startedResponse.status !== 202 || !started.runId || !started.statusUrl) {
    throw new Error(`Unexpected start response: ${JSON.stringify(started)}`);
  }

  const completed = await waitForJson(
    `${firstBaseUrl}${started.statusUrl}`,
    (body) => body.status === 'completed' || body.status === 'failed',
    80,
    { headers: authorization },
  );
  if (
    completed.status !== 'completed' ||
    completed.result?.message !== 'Verified through the Heroku Button demo' ||
    completed.result?.status !== 'completed'
  ) {
    throw new Error(`Unexpected workflow result: ${JSON.stringify(completed)}`);
  }
  await assertEncryptedAtRest(
    postgres.connectionString,
    started.runId,
    'Verified through the Heroku Button demo',
  );

  for (const pattern of ['fan-out', 'batching', 'saga']) {
    const cookbook = await startCookbook(firstBaseUrl, authorization, pattern);
    const result = await waitForTerminalRun(
      firstBaseUrl,
      authorization,
      cookbook.statusUrl,
    );
    if (result.status !== 'completed' || result.result?.pattern !== pattern) {
      throw new Error(
        `Unexpected ${pattern} cookbook result: ${JSON.stringify(result)}`,
      );
    }
    if (
      pattern === 'fan-out' &&
      JSON.stringify(result.result.delivered) !==
        JSON.stringify(['email', 'push', 'sms'])
    ) {
      throw new Error('Fan-out cookbook did not deliver all channels.');
    }
    if (
      pattern === 'batching' &&
      JSON.stringify(result.result.completed) !==
        JSON.stringify([1, 2, 3, 4, 5])
    ) {
      throw new Error('Batching cookbook did not complete every item.');
    }
    if (
      pattern === 'saga' &&
      (result.result.status !== 'rolled_back' ||
        JSON.stringify(result.result.compensated) !==
          JSON.stringify(['billing', 'account']))
    ) {
      throw new Error('Saga cookbook did not compensate in reverse order.');
    }
  }

  const secondPort = await availablePort();
  const secondBaseUrl = `http://127.0.0.1:${secondPort}`;
  const secondEnvironment = {
    ...commonEnvironment,
    DYNO: 'web.2',
    PORT: String(secondPort),
    WORKFLOW_LOCAL_BASE_URL: secondBaseUrl,
  };
  const secondServer = startServer(secondEnvironment);
  await waitForJson(`${secondBaseUrl}/health`, (body) => body.status === 'ok');

  const retryStartedAt = Date.now();
  const retry = await startScenario(
    firstBaseUrl,
    authorization,
    'retry',
    'retried',
    retryStartedAt + 750,
  );
  const retryCompleted = await waitForTerminalRun(
    secondBaseUrl,
    authorization,
    retry.statusUrl,
  );
  if (
    retryCompleted.status !== 'completed' ||
    retryCompleted.result?.scenario !== 'retry' ||
    retryCompleted.result?.payload !== 'retried' ||
    Date.now() - retryStartedAt < 500
  ) {
    throw new Error(
      `Unexpected retry result: ${JSON.stringify(retryCompleted)}`,
    );
  }

  const hookToken = `release-guard-${randomUUID()}`;
  const hook = await startScenario(
    firstBaseUrl,
    authorization,
    'hook',
    'waiting',
    hookToken,
  );
  await waitForJson(
    `${secondBaseUrl}${hook.statusUrl}`,
    (body) => body.status === 'running',
    80,
    { headers: authorization },
  );
  const blockedRelease = spawnSync(
    process.execPath,
    [join(root, 'bin', 'release-check.js'), '--json'],
    { cwd: root, encoding: 'utf8', env: firstEnvironment },
  );
  if (blockedRelease.status === 0) {
    throw new Error('Release guard admitted a release with an active hook.');
  }
  const resumeResponse = await fetch(
    `${secondBaseUrl}/api/hooks/${encodeURIComponent(hookToken)}`,
    {
      method: 'POST',
      headers: { ...authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ payload: 'approved' }),
    },
  );
  if (!resumeResponse.ok) {
    throw new Error(`Hook resume failed: ${await resumeResponse.text()}`);
  }
  const hookCompleted = await waitForTerminalRun(
    secondBaseUrl,
    authorization,
    hook.statusUrl,
  );
  if (
    hookCompleted.status !== 'completed' ||
    hookCompleted.result?.payload !== 'approved'
  ) {
    throw new Error(`Unexpected hook result: ${JSON.stringify(hookCompleted)}`);
  }

  const restart = await startScenario(
    firstBaseUrl,
    authorization,
    'restart',
    'survived restart',
    1_500,
  );
  await waitForJson(
    `${secondBaseUrl}${restart.statusUrl}`,
    (body) => body.status === 'running',
    80,
    { headers: authorization },
  );
  await stopServer(firstServer, 'SIGKILL');
  const restartedRun = await waitForTerminalRun(
    secondBaseUrl,
    authorization,
    restart.statusUrl,
  );
  if (
    restartedRun.status !== 'completed' ||
    restartedRun.result?.payload !== 'survived restart' ||
    restartedRun.result?.dyno !== 'web.2'
  ) {
    throw new Error(
      `Unexpected restart result: ${JSON.stringify(restartedRun)}`,
    );
  }

  if (postgres.containerName) {
    const outage = await startScenario(
      secondBaseUrl,
      authorization,
      'restart',
      'survived database outage',
      1_000,
    );
    await waitForJson(
      `${secondBaseUrl}${outage.statusUrl}`,
      (body) => body.status === 'running',
      80,
      { headers: authorization },
    );
    run('docker', ['pause', postgres.containerName], { capture: true });
    databasePaused = true;
    await sleep(1_100);
    const unavailable = await fetch(`${secondBaseUrl}/health`);
    if (unavailable.status !== 503) {
      throw new Error(
        `Expected database outage health check to return 503; received ${unavailable.status}.`,
      );
    }
    run('docker', ['unpause', postgres.containerName], { capture: true });
    databasePaused = false;
    await waitForJson(
      `${secondBaseUrl}/health`,
      (body) => body.status === 'ok',
    );
    const outageCompleted = await waitForTerminalRun(
      secondBaseUrl,
      authorization,
      outage.statusUrl,
      160,
    );
    if (
      outageCompleted.status !== 'completed' ||
      outageCompleted.result?.payload !== 'survived database outage'
    ) {
      throw new Error(
        `Unexpected database outage result: ${JSON.stringify(outageCompleted)}`,
      );
    }
  }

  run(process.execPath, [join(root, 'bin', 'release-check.js'), '--json'], {
    cwd: root,
    env: secondEnvironment,
  });
  const forcedShutdown = await stopServer(secondServer);
  if (forcedShutdown) {
    throw new Error(
      'The server did not stop within the 10-second drain window.',
    );
  }

  console.log(
    `Heroku Button demo passed HTTPS/HSTS, encryption, auth, cookbook, retry, hook, release-guard, two-process restart, database-outage, and graceful-shutdown checks with package ${installedPackage.version}.`,
  );
} catch (error) {
  if (logs.length > 0) {
    console.error('Demo server logs:\n', logs.join(''));
  }
  throw error;
} finally {
  if (databasePaused && postgres?.containerName) {
    spawnSync('docker', ['unpause', postgres.containerName], {
      stdio: 'ignore',
    });
  }
  for (const server of servers) {
    await stopServer(server);
  }
  if (postgres?.containerName) {
    spawnSync('docker', ['stop', postgres.containerName], { stdio: 'inherit' });
  }
}
