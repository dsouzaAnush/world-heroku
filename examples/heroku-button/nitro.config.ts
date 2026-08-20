import { defineConfig } from 'nitro';

export default defineConfig({
  modules: ['workflow/nitro'],
  plugins: ['./server/plugins/start-world.ts'],
  serverDir: './server',
});
