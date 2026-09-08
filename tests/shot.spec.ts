import { test } from '@playwright/test';

/** Visual check: summon the genie, build, look, screenshot. Not asserted; for eyes. */
test('screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.waitForFunction(() => (window as any).game?.sync !== undefined, null, { timeout: 60_000 });
  await page.evaluate(async () => {
    const g = (window as any).game;
    g.player.pitch = -0.15;
    g.summon();
    await new Promise<void>(res => {
      const orig = g.chat.setBusy.bind(g.chat);
      g.chat.setBusy = (b: boolean) => { orig(b); if (!b) res(); };
      g.chat.onSubmit('build me a pink house');
    });
    g.chat.onSubmit('a rainbow');
    await new Promise(r => setTimeout(r, 800));
    g.player.pos.z += 16; g.player.pos.y += 9; g.player.pitch = -0.45; g.player.flying = true;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/world.png' });
});
