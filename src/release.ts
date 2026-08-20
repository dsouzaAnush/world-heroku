type RunStatus = 'pending' | 'running';

interface RunSummary {
  runId: string;
  status: string;
  workflowName: string;
}

export interface WorldRunReader {
  runs: {
    list(params: {
      pagination: { cursor?: string; limit: number };
      resolveData: 'none';
      status: RunStatus;
    }): Promise<{
      cursor?: string | null;
      data: RunSummary[];
      hasMore: boolean;
    }>;
  };
}

export interface ActiveRunReport {
  pending: number;
  running: number;
  sample: RunSummary[];
  total: number;
}

/** Read all non-terminal runs using the public World storage interface. */
export async function inspectActiveRuns(
  world: WorldRunReader,
  options: { pageSize?: number; sampleSize?: number } = {},
): Promise<ActiveRunReport> {
  const pageSize = options.pageSize ?? 250;
  const sampleSize = options.sampleSize ?? 20;
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0 || pageSize > 1000) {
    throw new Error('pageSize must be an integer from 1 through 1000.');
  }
  if (!Number.isSafeInteger(sampleSize) || sampleSize < 0) {
    throw new Error('sampleSize must be a non-negative integer.');
  }

  const report: ActiveRunReport = {
    pending: 0,
    running: 0,
    sample: [],
    total: 0,
  };

  for (const status of ['pending', 'running'] as const) {
    let cursor: string | undefined;
    do {
      const page = await world.runs.list({
        pagination: { cursor, limit: pageSize },
        resolveData: 'none',
        status,
      });
      report[status] += page.data.length;
      report.total += page.data.length;
      for (const run of page.data) {
        if (report.sample.length >= sampleSize) break;
        report.sample.push({
          runId: run.runId,
          status: run.status,
          workflowName: run.workflowName,
        });
      }
      cursor = page.hasMore && page.cursor ? page.cursor : undefined;
    } while (cursor);
  }

  return report;
}
