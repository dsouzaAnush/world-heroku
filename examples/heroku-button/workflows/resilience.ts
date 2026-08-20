import { createHook, RetryableError, sleep } from 'workflow';

export type ResilienceScenario = 'hook' | 'restart' | 'retry';

export interface ResilienceResult {
  dyno: string;
  payload: string;
  scenario: ResilienceScenario;
}

export async function runResilienceScenario(
  scenario: ResilienceScenario,
  payload: string,
  option: string | number,
): Promise<ResilienceResult> {
  'use workflow';

  if (scenario === 'hook') {
    using hook = createHook<{ payload: string }>({ token: String(option) });
    const resumed = await hook;
    return recordCompletion(scenario, resumed.payload);
  }

  if (scenario === 'restart') {
    await sleep(Number(option));
    return recordCompletion(scenario, payload);
  }

  await retryUntil(Number(option));
  return recordCompletion(scenario, payload);
}

async function retryUntil(timestamp: number): Promise<void> {
  'use step';

  if (Date.now() < timestamp) {
    throw new RetryableError('Transient test failure', { retryAfter: 250 });
  }
}

async function recordCompletion(
  scenario: ResilienceScenario,
  payload: string,
): Promise<ResilienceResult> {
  'use step';

  return {
    dyno: process.env.DYNO ?? 'unknown',
    payload,
    scenario,
  };
}
