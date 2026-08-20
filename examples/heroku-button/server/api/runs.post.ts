import { defineEventHandler, readBody, setResponseStatus } from 'nitro/h3';
import { start } from 'workflow/api';
import { runHerokuDemo } from '../../workflows/demo.ts';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ message?: unknown }>(event);
  const message =
    typeof body?.message === 'string' ? body.message : 'Hello from Heroku';
  const run = await start(runHerokuDemo, [message]);

  setResponseStatus(event, 202);
  return {
    runId: run.runId,
    status: 'queued',
    statusUrl: `/api/runs/${run.runId}`,
  };
});
