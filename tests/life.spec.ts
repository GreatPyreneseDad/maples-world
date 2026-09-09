import { test, expect, type Page } from '@playwright/test';
import { SPECIES, KINGDOMS, speciesFor } from '../shared/taxonomy';

test.describe('taxonomy registry', () => {
  test('every species is a well-formed real binomial, unique, in one of five kingdoms', () => {
    const ids = new Set<string>(), names = new Set<string>();
    for (const sp of SPECIES) {
      expect(sp.binomial, sp.id).toMatch(/^[A-Z][a-z]+ [a-z]+$/);       // Genus species
      expect(KINGDOMS).toContain(sp.kingdom);
      expect(ids.has(sp.id), `dup id ${sp.id}`).toBe(false); ids.add(sp.id);
      expect(names.has(sp.binomial), `dup binomial ${sp.binomial}`).toBe(false); names.add(sp.binomial);
      expect(sp.habitats.length).toBeGreaterThan(0);
      expect(sp.fact.length).toBeGreaterThan(10);
    }
  });
  test('all five kingdoms are populated and every macro habitat has life', () => {
    for (const k of KINGDOMS) expect(SPECIES.filter(s => s.kingdom === k).length, k).toBeGreaterThanOrEqual(5);
    for (const h of ['grass', 'forest', 'sand', 'water', 'shore', 'snow', 'shade', 'wood'] as const) expect(speciesFor(h, 'macro').length, h).toBeGreaterThan(0);
    for (const h of ['pond', 'soil', 'leaf', 'moss', 'bark'] as const) expect(speciesFor(h, 'micro').length, h).toBeGreaterThan(0);
  });
});

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).game?.life !== undefined, null, { timeout: 60_000 });
  // Normal play spawns one column per frame; tests settle everything at once.
  await page.evaluate(() => { const g = (window as any).game; g.life.settle(g.player.pos); });
  await page.waitForTimeout(500);
}

test('life spawns across kingdoms, moves, and is deterministic for the seed', async ({ page }) => {
  await boot(page);
  const a = await page.evaluate(() => {
    const g = (window as any).game;
    const cs = g.life.critters.map((c: any) => ({ id: c.sp.id, k: c.sp.kingdom, x: Math.round(c.pos.x), z: Math.round(c.pos.z), by: c.spawnedBy }));
    return { n: cs.length, kingdoms: [...new Set(cs.map((c: any) => c.k))], world: cs.filter((c: any) => c.by === 'world').map((c: any) => `${c.id}@${c.x},${c.z}`).sort(), seed: g.meta.seed };
  });
  expect(a.n).toBeGreaterThan(8);
  expect(a.kingdoms.length).toBeGreaterThanOrEqual(2);
  // Animals move over time.
  const moved = await page.evaluate(async () => {
    const g = (window as any).game;
    const before = g.life.critters.filter((c: any) => c.sp.kingdom === 'Animalia').map((c: any) => [c.id, c.pos.clone()]);
    await new Promise(r => setTimeout(r, 2500));
    let moved = 0;
    for (const [id, p] of before) { const c = g.life.critters.find((c: any) => c.id === id); if (c && c.pos.distanceTo(p) > 0.05) moved++; }
    return { moved, animals: before.length };
  });
  expect(moved.animals).toBeGreaterThan(0);
  expect(moved.moved).toBeGreaterThan(0);
  // Reload → same world-spawned life at the same places (nondeterministic spread/genie excluded).
  await page.reload(); await boot(page);
  const b = await page.evaluate(() => (window as any).game.life.critters.filter((c: any) => c.spawnedBy === 'world').map((c: any) => `${c.sp.id}@${Math.round(c.pos.x)},${Math.round(c.pos.z)}`).sort());
  // Animals have moved since spawn, so compare species multiset rather than exact positions.
  const species = (l: string[]) => l.map(s => s.split('@')[0]).sort();
  expect(species(b)).toEqual(species(a.world));
});

test('genie can spawn a named creature and identify life; journal records it', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const g = (window as any).game;
    const spawn = g.edit.execute({ id: 't1', name: 'spawn_creature', input: { species: 'Vulpes vulpes', count: 2 } });
    const ident = g.edit.execute({ id: 't2', name: 'identify', input: { radius: 30 } });
    const micro = g.edit.execute({ id: 't3', name: 'spawn_creature', input: { species: 'Escherichia coli' } });
    const bad = g.edit.execute({ id: 't4', name: 'spawn_creature', input: { species: 'Dragonus imaginarius' } });
    return { spawn, ident, micro, bad, foxes: g.life.critters.filter((c: any) => c.sp.id === 'red-fox').length, journal: [...g.guide.discovered] };
  });
  expect(r.spawn.ok).toBe(true); expect(r.spawn.content).toMatch(/spawned 2 × Vulpes vulpes/);
  expect(r.foxes).toBeGreaterThanOrEqual(2);
  expect(r.ident.content).toContain('Vulpes vulpes');
  expect(r.micro.content).toMatch(/too small/);
  expect(r.bad.ok).toBe(false);
  expect(r.journal).toContain('red-fox');
});

test('microscope opens the small world with substrate-appropriate life; Q returns', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const g = (window as any).game;
    g.enterMicro('pond', 'microscope');
    await new Promise(r => setTimeout(r, 1200));
    const pond = { active: g.micro.active, n: g.micro.critters.length, kingdoms: [...new Set(g.micro.critters.map((c: any) => c.sp.kingdom))], ok: g.micro.critters.every((c: any) => c.sp.habitats.includes('pond') && c.sp.tier === 'micro'), sceneHidden: !g.scene.visible };
    g.leaveMicro();
    const after = { active: g.micro.active, n: g.micro.critters.length, sceneVisible: g.scene.visible };
    g.enterMicro('soil', 'shrink');
    await new Promise(r => setTimeout(r, 300));
    const soil = { mode: g.micro.mode, ok: g.micro.critters.every((c: any) => c.sp.habitats.includes('soil')), n: g.micro.critters.length };
    g.leaveMicro();
    return { pond, after, soil };
  });
  expect(r.pond.active).toBe(true); expect(r.pond.n).toBeGreaterThan(10); expect(r.pond.ok).toBe(true); expect(r.pond.sceneHidden).toBe(true);
  expect(r.pond.kingdoms).toEqual(expect.arrayContaining(['Protista', 'Monera']));
  expect(r.after.active).toBe(false); expect(r.after.n).toBe(0); expect(r.after.sceneVisible).toBe(true);
  expect(r.soil.mode).toBe('shrink'); expect(r.soil.ok).toBe(true); expect(r.soil.n).toBeGreaterThan(10);
});
