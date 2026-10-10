import { test, expect, type Page, type CDPSession } from '@playwright/test';

/** Touch controls: a phone-sized, finger-only browser can move, look, break, place and reach the genie. */
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

type G = any;
const game = (page: Page, fn: (g: G) => unknown) => page.evaluate(`(${fn.toString()})(window.game)`);

async function drag(cdp: CDPSession, from: [number, number], to: [number, number], holdMs = 0) {
  const pt = (p: [number, number]) => [{ x: p[0], y: p[1], id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from) });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt([from[0] + (to[0] - from[0]) * i / 6, from[1] + (to[1] - from[1]) * i / 6]) });
  if (holdMs) await new Promise(r => setTimeout(r, holdMs));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('a finger can play: move, look, break, place, summon the genie', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/world/');
  await page.waitForFunction(() => (window as any).game?.sync !== undefined, null, { timeout: 60_000 });
  expect(await game(page, g => g.input.touchMode)).toBe(true);
  await expect(page.locator('#hint')).toBeHidden();
  await expect(page.locator('#touch')).toBeHidden();

  await page.locator('#overlay').tap();
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.locator('#touch .t-act')).toBeVisible();

  const cdp = await context.newCDPSession(page);
  // Left thumb pushes the stick forward: the player walks.
  const p0 = await game(page, g => [g.player.pos.x, g.player.pos.z]) as number[];
  await drag(cdp, [120, 250], [120, 170], 1500);
  const p1 = await game(page, g => [g.player.pos.x, g.player.pos.z]) as number[];
  expect(Math.hypot(p1[0] - p0[0], p1[1] - p0[1])).toBeGreaterThan(0.1);   // software GL in CI runs slowly; any real walking counts
  await page.waitForTimeout(200);
  const p2 = await game(page, g => [g.player.pos.x, g.player.pos.z]) as number[];
  expect(Math.hypot(p2[0] - p1[0], p2[1] - p1[1])).toBeLessThan(0.05);   // lifting the thumb stops

  // Right thumb drags: the camera turns, and looks down at the ground.
  const yaw0 = await game(page, g => g.player.yaw) as number;
  await drag(cdp, [600, 120], [520, 300]);
  await page.waitForTimeout(150);
  expect(await game(page, g => g.player.yaw)).not.toBe(yaw0);
  await page.waitForFunction(() => !!(window as any).game.player.target);

  // Break removes the aimed block; Place puts one back against the next block.
  const t = await game(page, g => g.player.target.block) as number[];
  await page.locator('#touch .t-break').tap();
  await page.waitForFunction(([x, y, z]) => (window as any).game.world.getBlock(x, y, z) === 0, t);
  await page.waitForFunction(() => !!(window as any).game.player.target);
  await page.locator('#hotbar .slot').nth(7).tap();   // brick
  const spot = await game(page, g => { const h = g.player.target; return [h.block[0] + h.normal[0], h.block[1] + h.normal[1], h.block[2] + h.normal[2]]; }) as number[];
  await page.locator('#touch .t-place').tap();
  await page.waitForFunction(([x, y, z]) => (window as any).game.world.getBlock(x, y, z) !== 0, spot);

  // Tap the lamp, tap it again: the genie's chat opens and the controls step aside.
  await page.locator('#hotbar .slot').nth(0).tap();
  await page.locator('#hotbar .slot').nth(0).tap();
  await expect(page.locator('#chat')).toBeVisible();
  await expect(page.locator('#touch')).toBeHidden();
  await page.locator('#chat-close').tap();
  await expect(page.locator('#touch .t-act')).toBeVisible();   // straight back to playing, no extra tap
  await expect(page.locator('#overlay')).toBeHidden();

  // Menu buttons open panels; the panel's own close button hands control back.
  await page.locator('#touch [data-do="guild"]').tap();
  await expect(page.locator('#guild')).toBeVisible();
  await page.locator('#guild-close').tap();
  await expect(page.locator('#guild')).toBeHidden();
  await expect(page.locator('#touch .t-act')).toBeVisible();

  // Jump twice quickly to fly.
  const jump = (await page.locator('#touch [data-key="Space"]').boundingBox())!;
  await page.touchscreen.tap(jump.x + 30, jump.y + 30);
  await page.waitForTimeout(120);
  await page.touchscreen.tap(jump.x + 30, jump.y + 30);
  await page.waitForTimeout(200);
  expect(await game(page, g => g.player.flying)).toBe(true);
  await page.screenshot({ path: 'test-results/touch-landscape.png' });
  expect(errors.filter(e => !/WebGL|GPU|swiftshader/i.test(e))).toEqual([]);
});
