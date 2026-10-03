import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).game?.agent !== undefined, null, { timeout: 60_000 });
  await page.evaluate(() => { (window as any).game.overlay.hidden = true; });
}
const wish = (text: string) => `
  await new Promise(res => { const g = window.game; const orig = g.chat.setBusy.bind(g.chat); g.chat.setBusy = (b) => { orig(b); if (!b) { g.chat.setBusy = orig; res(); } }; g.chat.onSubmit(${JSON.stringify(text)}); });`;

test('the genie remembers what it built and can iterate on it by reference', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(`(async () => {
    const g = window.game; g.summon();
    ${wish('build me a pink house')}
    const b1 = g.edit.builds[g.edit.builds.length - 1];
    const pinkBefore = countIn(b1, 'pink');
    ${wish('make it blue')}
    const pinkAfter = countIn(b1, 'pink'), blueAfter = countIn(b1, 'blue');
    const topBefore = b1.max.y;
    ${wish('make it taller')}
    const b3 = g.edit.builds[g.edit.builds.length - 1];
    function countIn(b, name) { let n = 0; for (let x = b.min.x; x <= b.max.x; x++) for (let y = b.min.y; y <= b.max.y; y++) for (let z = b.min.z; z <= b.max.z; z++) if (g.world.getBlock(x, y, z) === blockIdByName(name)) n++; return n; }
    function blockIdByName(name) { return ['air','grass','dirt','stone','sand','water','wood','leaves','planks','glass','brick','cobble','snow','gold','diamond','red','orange','yellow','green','blue','purple','pink','white','black','lamp','salt','iron','copper','coal','chalk'].indexOf(name); }
    return { builds: g.edit.builds.length, wish1: b1.wish, pinkBefore, pinkAfter, blueAfter, grewUp: b3.max.y > topBefore, persisted: JSON.parse(localStorage.getItem('maples:genie-builds:' + g.meta.id)).length, history: JSON.parse(localStorage.getItem('maples:genie-history:' + g.meta.id)).length };
  })()`);
  expect(r.wish1).toBe('build me a pink house');
  expect(r.pinkBefore).toBeGreaterThan(20);
  expect(r.pinkAfter).toBe(0); expect(r.blueAfter).toBeGreaterThan(20);
  expect(r.grewUp).toBe(true);
  expect(r.persisted).toBeGreaterThanOrEqual(2);
  expect(r.history).toBeGreaterThanOrEqual(4);
});

test('conversation and notes survive a reload; the lamp greets a returning player', async ({ page }) => {
  await boot(page);
  await page.evaluate(`(async () => {
    const g = window.game; g.summon();
    ${wish('a tree')}
    g.edit.execute({ id: 'n1', name: 'remember', input: { note: "Player's name is Maple; she likes pink." } });
  })()`);
  await page.reload(); await boot(page);
  const r = await page.evaluate(() => {
    const g = (window as any).game;
    g.summon();
    const log = [...document.querySelectorAll('#chat-log .msg')].map(e => e.textContent);
    return { transcript: g.agent.transcript.length, notes: g.genieNotes, builds: g.edit.builds.map((b: any) => b.wish), log };
  });
  expect(r.transcript).toBeGreaterThanOrEqual(2);
  expect(r.notes[0]).toContain('Maple');
  expect(r.builds).toContain('a tree');
  expect(r.log.some((t: string) => t.includes('a tree'))).toBe(true);
  expect(r.log[r.log.length - 1]).toContain('Back again');
});
