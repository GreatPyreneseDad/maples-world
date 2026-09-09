import { test } from '@playwright/test';

test('screenshots: atoms spilling from broken blocks, and the Lab', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.waitForFunction(() => (window as any).game?.drops !== undefined, null, { timeout: 60_000 });
  await page.evaluate(() => {
    const g = (window as any).game;
    g.overlay.hidden = true;
    const px = Math.floor(g.player.pos.x), pz = Math.floor(g.player.pos.z);
    // Break a little pit in front of the player and let the atoms fly.
    for (let dx = -1; dx <= 1; dx++) for (let dz = 3; dz <= 5; dz++) {
      const x = px + dx, z = pz - dz, y = g.world.surfaceHeight(x, z);
      const name = g.world.getBlock(x, y, z);
      g.world.setBlock(x, y, z, 0);
      g.drops.burst(x, y, z, (window as any).__draw ? [] : ['Si', 'O', 'Al', 'Fe', 'K', 'Na', 'Ca', 'Mg', 'C', 'H'].slice(0, 3));
      void name;
    }
    g.drops.burst(px, g.world.surfaceHeight(px, pz - 4), pz - 4, ['Au', 'Cu', 'Cl', 'Ti']);
    g.player.pitch = -0.35; g.player.yaw = 0;
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/chem-atoms.png' });
  await page.evaluate(() => {
    const g = (window as any).game;
    for (const [s, n] of Object.entries({ H: 7, O: 9, Si: 3, Na: 2, Cl: 1, Fe: 2, Au: 4, C: 5, Ca: 1 })) g.atoms.add(s, n);
    g.toggleLab(true);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/chem-lab.png' });
});
