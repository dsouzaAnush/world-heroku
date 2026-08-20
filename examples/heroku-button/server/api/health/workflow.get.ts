import { defineEventHandler } from 'nitro/h3';
import { getWorld, healthCheck } from 'workflow/runtime';

export default defineEventHandler(async () => {
  const world = getWorld();
  const result = await healthCheck(world, 'workflow', {
    namespace: process.env.WORKFLOW_QUEUE_NAMESPACE,
    timeout: 10_000,
  });

  return {
    ...result,
    dyno: process.env.DYNO ?? null,
    status: result.healthy ? 'ok' : 'error',
  };
});
