#!/usr/bin/env node

try {
  process.loadEnvFile();
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const args = new Set(process.argv.slice(2));
const json = args.has('--json');
const policyArgument = process.argv
  .slice(2)
  .find((argument) => argument.startsWith('--policy='));
const policy =
  policyArgument?.slice('--policy='.length) ||
  process.env.WORKFLOW_HEROKU_RELEASE_POLICY?.trim() ||
  'block';

if (!['block', 'warn'].includes(policy)) {
  console.error('[heroku-world] Release policy must be "block" or "warn".');
  process.exitCode = 2;
} else {
  let world;
  try {
    const { createWorld, inspectActiveRuns } = await import('../dist/index.js');
    world = createWorld();
    const report = await inspectActiveRuns(world);
    const result = {
      activeRuns: report,
      policy,
      releaseVersion: process.env.HEROKU_RELEASE_VERSION || null,
      safe: report.total === 0,
    };

    if (json) {
      console.log(JSON.stringify(result));
    } else if (result.safe) {
      console.log('[heroku-world] Release check passed: no active runs.');
    } else {
      const message = `[heroku-world] Found ${report.total} active workflow runs (${report.pending} pending, ${report.running} running).`;
      const details = report.sample
        .map((run) => `  - ${run.runId} ${run.status} ${run.workflowName}`)
        .join('\n');
      const output = details ? `${message}\n${details}` : message;
      if (policy === 'block') console.error(output);
      else console.warn(output);
    }

    if (!result.safe && policy === 'block') process.exitCode = 1;
  } catch (error) {
    console.error('[heroku-world] Release check failed:', error);
    process.exitCode = 1;
  } finally {
    await world?.close?.();
  }
}
