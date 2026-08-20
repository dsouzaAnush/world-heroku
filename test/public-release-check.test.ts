import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { scanPublicRelease } from '../scripts/public-release-check.mjs';

const temporaryRepositories: string[] = [];

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), 'world-heroku-release-check-'));
  temporaryRepositories.push(root);
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  return root;
}

afterEach(() => {
  for (const root of temporaryRepositories.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('public release safety check', () => {
  test('allows example environment files at any depth', () => {
    const root = createRepository();
    mkdirSync(join(root, 'config'));
    writeFileSync(join(root, 'config/.env.example'), 'DATABASE_URL=\n');

    expect(scanPublicRelease(root).findings).toEqual([]);
  });

  test('rejects nested non-example environment files', () => {
    const root = createRepository();
    mkdirSync(join(root, 'config'));
    writeFileSync(join(root, 'config/.env.production'), 'SECRET=value\n');

    expect(scanPublicRelease(root).findings).toContain(
      'config/.env.production: unsafe public file path',
    );
  });

  test('scans literal query and fragment characters in Git paths', () => {
    const root = createRepository();
    writeFileSync(join(root, 'README.md'), 'Public content.\n');
    writeFileSync(
      join(root, 'README.md#private'),
      '/' + 'Users/private/project\n',
    );
    writeFileSync(
      join(root, 'README.md?private'),
      '/' + 'home/private/project\n',
    );

    expect(scanPublicRelease(root).findings).toEqual([
      'README.md#private: macOS user path',
      'README.md?private: Linux user path',
    ]);
  });

  test('rejects symbolic links instead of following them', () => {
    const root = createRepository();
    const outsideRoot = mkdtempSync(
      join(tmpdir(), 'world-heroku-outside-release-check-'),
    );
    temporaryRepositories.push(outsideRoot);
    const outside = join(outsideRoot, 'private-file');
    writeFileSync(outside, '/' + 'Users/private/project\n');
    symlinkSync(outside, join(root, 'linked-file'));

    expect(scanPublicRelease(root).findings).toEqual([
      'linked-file: unexpected non-regular file',
    ]);
  });
});
