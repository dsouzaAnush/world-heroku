import {
  createError,
  defineEventHandler,
  readBody,
  setResponseStatus,
} from 'nitro/h3';
import { start } from 'workflow/api';
import {
  type ResilienceScenario,
  runResilienceScenario,
} from '../../workflows/resilience.ts';

interface ScenarioRequest {
  option?: unknown;
  payload?: unknown;
  scenario?: unknown;
}

const scenarios = new Set<ResilienceScenario>(['hook', 'restart', 'retry']);

export default defineEventHandler(async (event) => {
  const body = await readBody<ScenarioRequest>(event);
  if (
    typeof body?.scenario !== 'string' ||
    !scenarios.has(body.scenario as ResilienceScenario)
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid scenario' });
  }

  const scenario = body.scenario as ResilienceScenario;
  const payload =
    typeof body.payload === 'string' ? body.payload.slice(0, 200) : scenario;
  let option: string | number;

  if (scenario === 'hook') {
    if (typeof body.option !== 'string' || body.option.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Hook token required',
      });
    }
    option = body.option.slice(0, 200);
  } else {
    if (typeof body.option !== 'number' || !Number.isFinite(body.option)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Numeric option required',
      });
    }
    option = body.option;
  }

  const run = await start(runResilienceScenario, [scenario, payload, option]);
  setResponseStatus(event, 202);
  return {
    runId: run.runId,
    status: 'queued',
    statusUrl: `/api/runs/${run.runId}`,
  };
});
