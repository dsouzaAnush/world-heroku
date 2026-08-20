import {
  createError,
  defineEventHandler,
  readBody,
  setResponseStatus,
} from 'nitro/h3';
import { start } from 'workflow/api';
import {
  type CookbookPattern,
  runCookbookPattern,
} from '../../workflows/cookbook.ts';

const patterns = new Set<CookbookPattern>(['batching', 'fan-out', 'saga']);

export default defineEventHandler(async (event) => {
  const body = await readBody<{ pattern?: unknown }>(event);
  if (
    typeof body?.pattern !== 'string' ||
    !patterns.has(body.pattern as CookbookPattern)
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid cookbook pattern',
    });
  }

  const run = await start(runCookbookPattern, [
    body.pattern as CookbookPattern,
  ]);
  setResponseStatus(event, 202);
  return {
    runId: run.runId,
    status: 'queued',
    statusUrl: `/api/runs/${run.runId}`,
  };
});
