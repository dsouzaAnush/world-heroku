#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const maxPublicFileBytes = 2 * 1024 * 1024;

const forbiddenPaths = [
  /(^|\/)\.npmrc$/,
  /(^|\/)\.pypirc$/,
  /\.(?:key|p12|pfx|pem|tgz)$/i,
];

const contentPatterns = [
  {
    label: 'private key material',
    expression: new RegExp('BEGIN ' + '(?:RSA |EC |OPENSSH )?PRIVATE KEY'),
  },
  {
    label: 'macOS user path',
    expression: new RegExp('/' + 'Users/[^/\\s"\'`]+'),
  },
  {
    label: 'Linux user path',
    expression: new RegExp('/' + 'home/[^/\\s"\'`]+'),
  },
  {
    label: 'Windows user path',
    expression: new RegExp('[A-Za-z]:\\\\' + 'Users\\\\[^\\\\\\s"\'`]+'),
  },
  {
    label: 'GitHub token',
    expression: new RegExp('gh' + '[pousr]_[A-Za-z0-9]{20,}'),
  },
  {
    label: 'npm token',
    expression: new RegExp('npm' + '_[A-Za-z0-9]{20,}'),
  },
  {
    label: 'Slack token',
    expression: new RegExp('xox' + '[aboprs]-[A-Za-z0-9-]{10,}'),
  },
  {
    label: 'AWS access key',
    expression: new RegExp('AK' + 'IA[0-9A-Z]{16}'),
  },
  {
    label: 'OpenAI-style secret key',
    expression: new RegExp('sk' + '-[A-Za-z0-9_-]{20,}'),
  },
  {
    label: 'Salesforce authentication URL',
    expression: new RegExp('force' + '://[^\\s"\']+'),
  },
];

function isUnsafePublicPath(file) {
  const isEnvironmentFile = /(^|\/)\.env(?:\.|$)/.test(file);
  const isExampleEnvironmentFile = /(^|\/)\.env\.example$/.test(file);

  return (
    (isEnvironmentFile && !isExampleEnvironmentFile) ||
    forbiddenPaths.some((pattern) => pattern.test(file))
  );
}

export function scanPublicRelease(
  root = fileURLToPath(new URL('../', import.meta.url)),
) {
  const repositoryRoot = realpathSync(root);
  const candidateOutput = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );

  const files = candidateOutput.split('\0').filter(Boolean).sort();
  const findings = [];

  for (const file of files) {
    if (isUnsafePublicPath(file)) {
      findings.push(`${file}: unsafe public file path`);
      continue;
    }

    const candidatePath = resolve(repositoryRoot, file);
    const pathWithinRepository = relative(repositoryRoot, candidatePath);
    if (
      pathWithinRepository === '' ||
      pathWithinRepository === '..' ||
      pathWithinRepository.startsWith(`..${sep}`) ||
      isAbsolute(pathWithinRepository)
    ) {
      findings.push(`${file}: resolves outside the repository`);
      continue;
    }

    const candidateStat = lstatSync(candidatePath);
    if (!candidateStat.isFile()) {
      findings.push(`${file}: unexpected non-regular file`);
      continue;
    }

    if (candidateStat.size > maxPublicFileBytes) {
      findings.push(`${file}: exceeds the 2 MiB public-source limit`);
      continue;
    }

    const data = readFileSync(candidatePath);
    if (data.includes(0)) {
      findings.push(`${file}: unexpected binary file`);
      continue;
    }

    const content = data.toString('utf8');
    for (const { label, expression } of contentPatterns) {
      if (expression.test(content)) {
        findings.push(`${file}: ${label}`);
      }
    }
  }

  return { files, findings };
}

export function main() {
  const { files, findings } = scanPublicRelease();

  if (findings.length > 0) {
    console.error('Public release safety check failed:');
    for (const finding of findings) console.error(`- ${finding}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Public release safety check passed (${files.length} files scanned).`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) main();
