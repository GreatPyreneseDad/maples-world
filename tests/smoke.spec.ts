import { test, expect, type Page } from '@playwright/test';

/** Smoke test: the world boots, renders, and the (offline) genie can edit it and undo. */

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.waitForFunction(() => (window as any).game?.sync !== undefined, null, { timeout: 60_000 });
  return errors;
}

test('boots, generates terrain, meshes chunks', async ({ page }) => {
  const errors = await boot(page);
  const stats = await page.evaluate(() => {
    const g = (window as any).game;
    return { chunks: g.world.chunks.size, meshes: g.chunks.meshCount, y: g.player.pos.y, status: document.getElementById('overlay-status')!.textContent };
  });
  expect(stats.chunks).toBeGreaterThan(200);
  expect(stats.meshes).toBeGreaterThan(20);
  expect(stats.y).toBeGreaterThan(1);
  expect(errors.filter(e => !/WebGL|GPU|swiftshader/i.test(e))).toEqual([]);
});

test('offline genie builds a house and undo restores the world', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const g = (window as any).game;
    g.summon();
    const before = g.world.modifiedChunks().length;
    const log: string[] = [];
    await new Promise<void>(res => {
      const orig = g.chat.setBusy.bind(g.chat);
      g.chat.setBusy = (b: boolean) => { orig(b); if (!b) res(); };
      g.chat.onSubmit('build me a pink house');
    });
    const afterBuild = g.world.modifiedChunks().length;
    const depth = g.edit.undoDepth;
    const msg = g.edit.undo(depth);
    log.push(msg);
    return { before, afterBuild, depth, undoDepth: g.edit.undoDepth, genieVisible: g.genie.visible, log };
  });
  expect(result.afterBuild).toBeGreaterThan(result.before);
  expect(result.depth).toBeGreaterThanOrEqual(5);
  expect(result.undoDepth).toBe(0);
  expect(result.genieVisible).toBe(true);
});

test('edits persist to IndexedDB across reload', async ({ page }) => {
  await boot(page);
  const placed = await page.evaluate(async () => {
    const g = (window as any).game;
    const x = 3, z = 3, y = g.world.surfaceHeight(x, z) + 1;
    g.world.setBlock(x, y, z, 10); // brick
    await g.sync.flush();
    return { x, y, z, worldId: g.meta.id };
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).game?.sync !== undefined, null, { timeout: 60_000 });
  const check = await page.evaluate(({ x, y, z, worldId }) => {
    const g = (window as any).game;
    return { id: g.world.getBlock(x, y, z), same: g.meta.id === worldId };
  }, placed);
  expect(check.same).toBe(true);
  expect(check.id).toBe(10);
});
