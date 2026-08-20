import { FatalError } from 'workflow';

// Small deterministic forms of the Workflow SDK common-patterns and
// errors-and-retries cookbook examples, suitable for a release smoke test.
export type CookbookPattern = 'batching' | 'fan-out' | 'saga';

export async function runCookbookPattern(pattern: CookbookPattern) {
  'use workflow';

  if (pattern === 'fan-out') {
    const delivered = await Promise.all(
      ['email', 'push', 'sms'].map(deliverNotification),
    );
    return { delivered, failed: 0, pattern };
  }

  if (pattern === 'batching') {
    const items = [1, 2, 3, 4, 5];
    const completed: number[] = [];
    for (let index = 0; index < items.length; index += 2) {
      const batch = items.slice(index, index + 2);
      completed.push(...(await Promise.all(batch.map(processItem))));
    }
    return { completed, failed: 0, pattern };
  }

  const completed: string[] = [];
  try {
    completed.push(await provisionResource('account'));
    completed.push(await provisionResource('billing'));
    await failProvisioning();
    return { pattern, status: 'completed' };
  } catch {
    const compensated: string[] = [];
    for (const resource of completed.reverse()) {
      compensated.push(await compensateResource(resource));
    }
    return { compensated, pattern, status: 'rolled_back' };
  }
}

async function deliverNotification(channel: string): Promise<string> {
  'use step';
  return channel;
}

async function processItem(item: number): Promise<number> {
  'use step';
  return item;
}

async function provisionResource(resource: string): Promise<string> {
  'use step';
  return resource;
}

async function failProvisioning(): Promise<never> {
  'use step';
  throw new FatalError('Intentional cookbook saga failure');
}

async function compensateResource(resource: string): Promise<string> {
  'use step';
  return resource;
}
