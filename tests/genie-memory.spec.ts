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

test('a history poisoned by an unanswered tool_use is repaired on load and the genie keeps working', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).game?.agent !== undefined, null, { timeout: 60_000 });
  const n = await page.evaluate(() => {
    const g = (window as any).game;
    // What a max_tokens cut-off used to leave behind: tool_use blocks with no tool_result after them.
    const poisoned = [
      { role: 'user', content: 'build balloons everywhere' },
      { role: 'assistant', content: [{ type: 'text', text: 'Balloons coming up!' }, { type: 'tool_use', id: 'toolu_a', name: 'sphere', input: {} }, { type: 'tool_use', id: 'toolu_b', name: 'sphere', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_a', content: 'ok' }] }, // b never answered
      { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_c', name: 'line', input: {} }] },
    ];
    localStorage.setItem('maples:genie-history:' + g.meta.id, JSON.stringify(poisoned));
    return poisoned.length;
  });
  expect(n).toBe(4);
  await page.reload(); await boot(page);
  const r = await page.evaluate(`(async () => {
    const g = window.game;
    g.summon();
    ${wish('a tree')}
    const hist = JSON.parse(localStorage.getItem('maples:genie-history:' + g.meta.id));
    const ids = (m, t, k) => Array.isArray(m.content) ? m.content.filter(b => b.type === t).map(b => b[k]) : [];
    let paired = true;
    for (let i = 0; i < hist.length; i++) {
      const uses = ids(hist[i], 'tool_use', 'id');
      const results = i + 1 < hist.length ? ids(hist[i + 1], 'tool_result', 'tool_use_id') : [];
      for (const u of uses) if (!results.includes(u)) paired = false;
    }
    return { len: hist.length, first: hist[0].role, last: hist[hist.length - 1].role, paired, builds: g.edit.builds.length };
  })()`);
  expect(r.paired).toBe(true);
  expect(r.first).toBe('user'); expect(r.last).toBe('assistant');
  expect(r.builds).toBeGreaterThanOrEqual(1);
});
