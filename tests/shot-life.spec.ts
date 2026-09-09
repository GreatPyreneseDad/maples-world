import { test } from '@playwright/test';

test('screenshots: life with goggles, and the pond under the microscope', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.waitForFunction(() => (window as any).game?.life !== undefined, null, { timeout: 60_000 });
  await page.evaluate(async () => {
    const g = (window as any).game;
    g.life.settle(g.player.pos);
    g.hotbar.select(1); // goggles
    // Put a little zoo in front of the camera.
    for (const [sp, n] of [['red-fox', 1], ['rabbit', 2], ['dandelion', 3], ['fly-agaric', 2], ['honey-bee', 2], ['raven', 1], ['bracken', 2]] as const)
      g.edit.execute({ id: sp, name: 'spawn_creature', input: { species: sp, count: n, near: { x: Math.floor(g.player.pos.x) - 7, y: 0, z: Math.floor(g.player.pos.z) } } });
    g.player.pos.y += 2.5; g.player.flying = true; g.player.pitch = -0.3; g.player.yaw = Math.PI / 2;
    g.overlay.hidden = true;
  });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'test-results/life-goggles.png' });

  await page.evaluate(async () => { const g = (window as any).game; g.enterMicro('pond', 'microscope'); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/micro-pond.png' });

  await page.evaluate(async () => { const g = (window as any).game; g.leaveMicro(); g.enterMicro('soil', 'shrink'); });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/micro-soil-shrink.png' });
  await page.evaluate(() => { const g = (window as any).game; g.leaveMicro(); g.toggleJournal(true); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/journal.png' });
});
