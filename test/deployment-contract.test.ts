import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('Heroku deployment contract', () => {
  it('uses the blocking release policy in the one-click deployment', () => {
    const procfile = readFileSync(join(root, 'Procfile'), 'utf8');
    const appJson = JSON.parse(
      readFileSync(join(root, 'app.json'), 'utf8'),
    ) as {
      env?: Record<string, { value?: string }>;
    };

    const release = procfile
      .split('\n')
      .find((line) => line.startsWith('release:'));

    expect(release).toContain('workflow-heroku-release-check');
    expect(release).not.toContain('--policy=warn');
    expect(appJson.env?.WORKFLOW_HEROKU_RELEASE_POLICY?.value).toBe('block');
  });
});
