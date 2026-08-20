import { createError, defineEventHandler, getRouterParam } from 'nitro/h3';
import { getRun } from 'workflow/api';

export default defineEventHandler(async (event) => {
  const runId = getRouterParam(event, 'id');
  if (!runId) {
    throw createError({ statusCode: 400, statusMessage: 'Run ID is required' });
  }

  const run = getRun(runId);
  const status = await run.status;

  return {
    runId,
    status,
    ...(status === 'completed' ? { result: await run.returnValue } : {}),
  };
});
