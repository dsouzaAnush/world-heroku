export interface HerokuCapacityInput {
  /** Total connection limit reported by the attached Heroku Postgres plan. */
  databaseConnectionLimit: number;
  /** Number of Node.js application processes that create a World. */
  processes: number;
  /** `WORKFLOW_HEROKU_MAX_POOL_SIZE` for each process. */
  workflowPoolSize: number;
  /** Other application pool connections created by each process. */
  applicationPoolSize?: number;
  /** Connections reserved for release-phase and one-off processes. */
  oneOffConnections?: number;
  /** Connections intentionally kept free for administration and failover. */
  headroomConnections?: number;
  /** Postgres World's lazy LISTEN client count per process. */
  listenerConnectionsPerProcess?: number;
}

export interface HerokuCapacityPlan extends Required<HerokuCapacityInput> {
  availableConnections: number;
  requiredConnections: number;
  safe: boolean;
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received ${value}.`);
  }
  return value;
}

function nonNegativeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `${name} must be a non-negative integer; received ${value}.`,
    );
  }
  return value;
}

/**
 * Calculate the worst-case database connection budget for a Heroku formation.
 *
 * Postgres World shares its configured pool with Graphile Worker and Drizzle,
 * but opens one additional LISTEN client lazily in each process.
 */
export function calculateHerokuCapacity(
  input: HerokuCapacityInput,
): HerokuCapacityPlan {
  const databaseConnectionLimit = positiveInteger(
    'databaseConnectionLimit',
    input.databaseConnectionLimit,
  );
  const processes = positiveInteger('processes', input.processes);
  const workflowPoolSize = positiveInteger(
    'workflowPoolSize',
    input.workflowPoolSize,
  );
  const applicationPoolSize = nonNegativeInteger(
    'applicationPoolSize',
    input.applicationPoolSize ?? 0,
  );
  const oneOffConnections = nonNegativeInteger(
    'oneOffConnections',
    input.oneOffConnections ?? 1,
  );
  const headroomConnections = nonNegativeInteger(
    'headroomConnections',
    input.headroomConnections ?? 2,
  );
  const listenerConnectionsPerProcess = nonNegativeInteger(
    'listenerConnectionsPerProcess',
    input.listenerConnectionsPerProcess ?? 1,
  );

  const requiredConnections =
    processes *
      (workflowPoolSize + applicationPoolSize + listenerConnectionsPerProcess) +
    oneOffConnections +
    headroomConnections;

  return {
    applicationPoolSize,
    availableConnections: databaseConnectionLimit - requiredConnections,
    databaseConnectionLimit,
    headroomConnections,
    listenerConnectionsPerProcess,
    oneOffConnections,
    processes,
    requiredConnections,
    safe: requiredConnections <= databaseConnectionLimit,
    workflowPoolSize,
  };
}

export function assertHerokuCapacity(
  input: HerokuCapacityInput,
): HerokuCapacityPlan {
  const plan = calculateHerokuCapacity(input);
  if (!plan.safe) {
    throw new Error(
      `Heroku World requires up to ${plan.requiredConnections} database connections, exceeding the configured limit of ${plan.databaseConnectionLimit}. Reduce process or pool counts, or use a larger database plan.`,
    );
  }
  return plan;
}
