import {
  createError,
  defineEventHandler,
  getRouterParam,
  readBody,
} from 'nitro/h3';
import { resumeHook } from 'workflow/api';

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Hook token required',
    });
  }

  const body = await readBody<{ payload?: unknown }>(event);
  const payload =
    typeof body?.payload === 'string' ? body.payload.slice(0, 200) : 'resumed';
  const result = await resumeHook(token, { payload });
  return { runId: result.runId, status: 'resumed' };
});
