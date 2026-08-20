import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      provider: 'v8',
    },
    exclude: ['test/**/*.integration.test.ts'],
    include: ['test/**/*.test.ts'],
  },
});
