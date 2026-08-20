#!/usr/bin/env node

try {
  process.loadEnvFile();
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const connectionString =
  process.env.WORKFLOW_HEROKU_POSTGRES_URL?.trim() ||
  process.env.WORKFLOW_POSTGRES_URL?.trim() ||
  process.env.DATABASE_URL?.trim();

if (!connectionString) {
  console.error(
    '[heroku-world] WORKFLOW_HEROKU_POSTGRES_URL, WORKFLOW_POSTGRES_URL, or DATABASE_URL is required.',
  );
  process.exitCode = 1;
} else {
  process.env.WORKFLOW_POSTGRES_URL = connectionString;

  import('@workflow/world-postgres/cli')
    .then(({ setupDatabase }) => setupDatabase())
    .catch((error) => {
      console.error('[heroku-world] Database bootstrap failed:', error);
      process.exitCode = 1;
    });
}
