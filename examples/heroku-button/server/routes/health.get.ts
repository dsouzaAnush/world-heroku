import { defineEventHandler } from 'nitro/h3';

export default defineEventHandler(() => ({
  databaseConfigured: Boolean(process.env.DATABASE_URL),
  node: process.version,
  status: 'ok',
  world: process.env.WORKFLOW_TARGET_WORLD,
}));
