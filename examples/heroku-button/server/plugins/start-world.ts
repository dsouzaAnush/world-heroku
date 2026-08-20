import { definePlugin } from 'nitro';

export default definePlugin(async (nitro) => {
  const { getWorld } = await import('workflow/runtime');
  const world = getWorld();
  await world.start?.();

  nitro.hooks.hook('close', async () => {
    await world.close?.();
  });
});
