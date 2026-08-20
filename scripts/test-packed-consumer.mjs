#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  accessSync,
  constants,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootManifest = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
);
const temporaryRoot = mkdtempSync(join(tmpdir(), 'world-heroku-consumer-'));
const consumer = join(temporaryRoot, 'consumer');

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });
}

try {
  const packedFilename = execFileSync(
    'npm',
    ['pack', '--silent', '--pack-destination', temporaryRoot],
    { cwd: root, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .at(-1);

  if (!packedFilename?.endsWith('.tgz')) {
    throw new Error(`npm pack did not return a tarball: ${packedFilename}`);
  }

  const tarball = join(temporaryRoot, packedFilename);
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, 'package.json'),
    `${JSON.stringify(
      {
        name: 'world-heroku-packed-consumer',
        private: true,
        type: 'module',
        dependencies: {
          '@anushdsouza/world-heroku': `file:${tarball}`,
          workflow: rootManifest.devDependencies.workflow,
        },
        overrides: rootManifest.overrides,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(consumer, 'verify.mjs'),
    `import manifest from '@anushdsouza/world-heroku/package.json' with { type: 'json' };
import { createWorld, deriveRunEncryptionKey } from '@anushdsouza/world-heroku';
import * as schema from '@anushdsouza/world-heroku/schema';

if (manifest.version !== ${JSON.stringify(rootManifest.version)}) {
  throw new Error(\`Expected package ${rootManifest.version}; received \${manifest.version}.\`);
}
if (typeof createWorld !== 'function' || typeof deriveRunEncryptionKey !== 'function') {
  throw new Error('Package root exports are incomplete.');
}
if (!('runs' in schema) || !('events' in schema) || !('steps' in schema)) {
  throw new Error('Schema exports are incomplete.');
}
`,
  );

  run('npm', ['install', '--min-release-age=7'], consumer);
  run('npm', ['audit', '--omit=dev', '--audit-level=high'], consumer);
  run(process.execPath, ['verify.mjs'], consumer);

  for (const bin of [
    'workflow-heroku-bootstrap',
    'workflow-heroku-doctor',
    'workflow-heroku-release-check',
  ]) {
    accessSync(join(consumer, 'node_modules', '.bin', bin), constants.X_OK);
  }

  console.log(
    `Packed consumer verified ${rootManifest.name}@${rootManifest.version}, public exports, executable CLIs, and a zero-high-severity production audit.`,
  );
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
