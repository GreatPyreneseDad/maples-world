import { test, expect, type Page } from '@playwright/test';
import { ELEMENTS, ELEMENT_BY_SYMBOL, BLOCK_COMPOSITION, RECIPES, drawAtoms } from '../shared/chemistry';
import { BLOCK_NAMES } from '../shared/genie-tools';

test.describe('chemistry contract', () => {
  test('118 real elements, unique symbols, sequential Z', () => {
    expect(ELEMENTS.length).toBe(118);
    ELEMENTS.forEach((e, i) => { expect(e.z).toBe(i + 1); expect(e.symbol).toMatch(/^[A-Z][a-z]?$/); });
    expect(new Set(ELEMENTS.map(e => e.symbol)).size).toBe(118);
    expect(ELEMENT_BY_SYMBOL.Au.name).toBe('gold'); expect(ELEMENT_BY_SYMBOL.Fe.z).toBe(26);
  });
  test('every breakable block has a composition of real symbols; every recipe is satisfiable and yields a real block', () => {
    for (const b of BLOCK_NAMES) {
      if (b === 'air') continue;
      const comp = BLOCK_COMPOSITION[b];
      expect(comp, `composition for ${b}`).toBeTruthy();
      for (const sym of Object.keys(comp!)) expect(ELEMENT_BY_SYMBOL[sym], `${b} uses unknown ${sym}`).toBeTruthy();
      expect(drawAtoms(b, 3, () => 0.5).length).toBe(3);
    }
    const ids = new Set<string>();
    for (const r of RECIPES) {
      expect(ids.has(r.id)).toBe(false); ids.add(r.id);
      expect(BLOCK_NAMES).toContain(r.yields);
      for (const sym of Object.keys(r.needs)) {
        expect(ELEMENT_BY_SYMBOL[sym]).toBeTruthy();
        // Every atom a recipe needs can be found by breaking some block.
        expect(Object.values(BLOCK_COMPOSITION).some(c => c && sym in c), `${sym} for ${r.id} is unobtainable`).toBe(true);
      }
    }
  });
});

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).game?.drops !== undefined, null, { timeout: 60_000 });
}

test('breaking a block spills labelled atoms; walking over them fills the pocket; the Lab crafts H₂O', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const g = (window as any).game;
    // Break the block under the player's feet-front: emulate the click path.
    const x = Math.floor(g.player.pos.x) + 2, z = Math.floor(g.player.pos.z);
    const y = g.world.surfaceHeight(x, z);
    const name = g.world.getBlock(x, y, z);
    g.world.setBlock(x, y, z, 0);
    g.drops.burst(x, y, z, ['H', 'H', 'O', 'Au']);
    const spawned = g.drops.atoms.map((a: any) => a.symbol);
    // Stand on them.
    g.player.pos.set(x + 0.5, y + 1.01, z + 0.5);
    await new Promise(res => setTimeout(res, 2500));
    const counts = { ...g.atoms.counts };
    const water = g.lab && (await (async () => {
      const recipe = (window as any).__RECIPES ?? null; return recipe;
    })());
    void water; void name;
    // Craft water via inventory + placement.
    const rec = g.atoms.available().find((r: any) => r.id === 'water');
    let placed = null;
    if (rec && g.atoms.craft(rec)) { g.placeCrafted(rec); placed = rec.id; }
    return { spawned, counts, placed, after: { ...g.atoms.counts }, crafted: [...g.atoms.crafted], left: g.drops.atoms.length };
  });
  expect(r.spawned.sort()).toEqual(['Au', 'H', 'H', 'O']);
  expect(r.counts.H).toBe(2); expect(r.counts.O).toBe(1); expect(r.counts.Au).toBe(1);
  expect(r.left).toBe(0);
  expect(r.placed).toBe('water');
  expect(r.after.H ?? 0).toBe(0); expect(r.after.O ?? 0).toBe(0); expect(r.after.Au).toBe(1);
  expect(r.crafted).toContain('water');
});

test('inventory persists across reload; genie can give an element', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { const g = (window as any).game; g.atoms.add('Na', 2); g.atoms.add('Cl', 1); });
  await page.reload(); await boot(page);
  const r = await page.evaluate(() => {
    const g = (window as any).game;
    const give = g.edit.execute({ id: 'g1', name: 'give_element', input: { symbol: 'au', count: 3 } });
    const bad = g.edit.execute({ id: 'g2', name: 'give_element', input: { symbol: 'Xx' } });
    return { na: g.atoms.counts.Na, cl: g.atoms.counts.Cl, give, bad, dropped: g.drops.atoms.filter((a: any) => a.symbol === 'Au').length };
  });
  expect(r.na).toBe(2); expect(r.cl).toBe(1);
  expect(r.give.ok).toBe(true); expect(r.give.content).toMatch(/3 × Au/); expect(r.dropped).toBe(3);
  expect(r.bad.ok).toBe(false);
});
