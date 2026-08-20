import { createError, defineEventHandler } from 'nitro/h3';
import { getWorld } from 'workflow/runtime';

const HEALTH_CACHE_MS = 1_000;
let lastHealthyAt = 0;
let pendingCheck: Promise<void> | undefined;

async function withTimeout<T>(
  operation: Promise<T>,
  milliseconds: number,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Workflow storage health check timed out')),
          milliseconds,
        );
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export default defineEventHandler(async () => {
  const world = getWorld();
  try {
    if (Date.now() - lastHealthyAt >= HEALTH_CACHE_MS) {
      pendingCheck ??= withTimeout(
        world.runs
          .list({
            pagination: { limit: 1 },
            resolveData: 'none',
          })
          .then(() => undefined),
        5_000,
      ).finally(() => {
        pendingCheck = undefined;
      });
      await pendingCheck;
      lastHealthyAt = Date.now();
    }
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'Workflow storage is unavailable',
    });
  }

  return {
    status: 'ok',
    storage: 'healthy',
    world: process.env.WORKFLOW_TARGET_WORLD,
  };
});
