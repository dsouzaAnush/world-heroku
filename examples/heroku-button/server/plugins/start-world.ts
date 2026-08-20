import { definePlugin } from 'nitro';

export default definePlugin(async () => {
  const { getWorld } = await import('workflow/runtime');
  const world = getWorld();
  await world.start?.();
});
