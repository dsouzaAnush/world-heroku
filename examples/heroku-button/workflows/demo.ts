import { sleep } from 'workflow';

export interface DemoResult {
  message: string;
  processedAt: string;
  status: 'completed';
}

export async function runHerokuDemo(message: string): Promise<DemoResult> {
  'use workflow';

  const normalizedMessage = await normalizeMessage(message);
  await sleep('1s');
  return completeDemo(normalizedMessage);
}

async function normalizeMessage(message: string): Promise<string> {
  'use step';

  return message.trim().slice(0, 200) || 'Hello from Heroku';
}

async function completeDemo(message: string): Promise<DemoResult> {
  'use step';

  return {
    message,
    processedAt: new Date().toISOString(),
    status: 'completed',
  };
}
