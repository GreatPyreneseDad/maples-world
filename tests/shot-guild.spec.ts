import { test } from '@playwright/test';

test('screenshots: quests in the world, and the Guild hall', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.waitForFunction(() => (window as any).game?.guild !== undefined, null, { timeout: 60_000 });
  await page.evaluate(() => {
    const g = (window as any).game;
    g.life.settle(g.player.pos); g.overlay.hidden = true;
    g.player.yaw = Math.PI / 2; g.player.pitch = -0.25;                  // face the land
    g.guild.offer('free');
    g.guild.offer('feed', 'rabbit');
    g.guild.offer('shelter');
    g.player.pos.y += 3; g.player.flying = true;
    g.guildPanel.renderHud();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/guild-world.png' });
  await page.evaluate(() => { const g = (window as any).game; g.togglePanel(g.guildPanel, true); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/guild-hall.png' });
});
