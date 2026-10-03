import { test, expect } from '@playwright/test';

// Live end-to-end: real Supabase anonymous auth + real Claude genie. Skipped unless LIVE_GENIE=1.
test.skip(!process.env.LIVE_GENIE, 'set LIVE_GENIE=1 to hit the real backend');

test('the real genie answers, builds, and iterates on its own build', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.waitForFunction(() => (window as any).game?.agent !== undefined, null, { timeout: 90_000 });
  const status = await page.evaluate(() => (window as any).game.overlayStatus.textContent);
  console.log('overlay:', status);
  expect(status).toContain('genie: Claude');
  expect(status).toContain('cloud save on');

  const r = await page.evaluate(`(async () => {
    const g = window.game; g.overlay.hidden = true; g.summon();
    const wish = (text) => new Promise(res => { const orig = g.chat.setBusy.bind(g.chat); g.chat.setBusy = (b) => { orig(b); if (!b) { g.chat.setBusy = orig; res(); } }; g.chat.onSubmit(text); });
    await wish('build me a small pink house right in front of me');
    const b1 = g.edit.builds[g.edit.builds.length - 1];
    const log1 = [...document.querySelectorAll('#chat-log .msg')].map(e => e.textContent);
    await wish('make it blue instead');
    const log2 = [...document.querySelectorAll('#chat-log .msg')].map(e => e.textContent).slice(log1.length);
    const count = (name) => { if (!b1) return -1; let n = 0; const id = ['air','grass','dirt','stone','sand','water','wood','leaves','planks','glass','brick','cobble','snow','gold','diamond','red','orange','yellow','green','blue','purple','pink','white','black','lamp','salt','iron','copper','coal','chalk'].indexOf(name); for (let x = b1.min.x; x <= b1.max.x; x++) for (let y = b1.min.y; y <= b1.max.y; y++) for (let z = b1.min.z; z <= b1.max.z; z++) if (g.world.getBlock(x, y, z) === id) n++; return n; };
    return { build1: b1 && { wish: b1.wish, blocks: b1.blocks }, pinkNow: count('pink'), blueNow: count('blue'), log1, log2, builds: g.edit.builds.length };
  })()`);
  console.log(JSON.stringify(r, null, 1));
  console.log('console errors:', errors);
  expect(r.build1).toBeTruthy();
  expect(r.log1.some((t: string) => t.startsWith('✦'))).toBe(true);
  expect(r.blueNow).toBeGreaterThan(0);
});
