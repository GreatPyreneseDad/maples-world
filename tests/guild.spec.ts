import { test, expect, type Page } from '@playwright/test';
import { QUEST_ANIMALS, foodOf } from '../shared/guild';
import { SPECIES_BY_ID } from '../shared/taxonomy';

test('every quest animal has a real, obtainable favourite food (or is domestic with one)', () => {
  expect(QUEST_ANIMALS.length).toBeGreaterThanOrEqual(8);
  for (const a of QUEST_ANIMALS) {
    const f = foodOf(a);
    expect(f, a.id).toBeTruthy();
    expect(f!.kingdom).toBe('Plantae');
    for (const d of a.diet!) expect(SPECIES_BY_ID[d], `${a.id} eats unknown ${d}`).toBeTruthy();
  }
});

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).game?.guild !== undefined, null, { timeout: 60_000 });
  await page.evaluate(() => { const g = (window as any).game; g.life.settle(g.player.pos); g.overlay.hidden = true; });
}

test('feed quest: plant the favourite food, the animal eats it and becomes a friend', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const g = (window as any).game;
    const q = g.guild.offer('feed', 'rabbit');
    const subject = g.life.critters.find((c: any) => c.id === q.subjectId);
    const plant = g.life.plant(g.guild && (window as any).game.life.constructor.species(q.foodId), Math.floor(subject.pos.x) + 1, Math.floor(subject.pos.z));
    plant.growth = 1; subject.hunger = 1; subject.seekTimer = 0;
    const t0 = Date.now();
    while (!q.done && Date.now() - t0 < 12_000) await new Promise(r => setTimeout(r, 200));
    return { kind: q.kind, done: q.done, friendly: subject.friendly, grazed: plant.growth < 0.5, points: g.guild.points, friends: [...g.guild.befriended], title: q.title, brief: q.brief };
  });
  expect(r.done).toBe(true); expect(r.friendly).toBe(true); expect(r.grazed).toBe(true);
  expect(r.points).toBe(10); expect(r.friends).toContain('rabbit');
  expect(r.brief).toContain('Trifolium repens');
});

test('shelter quest: a roof and three walls around the sheep completes it', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const g = (window as any).game;
    const q = g.guild.offer('shelter');
    const s = g.life.critters.find((c: any) => c.id === q.subjectId);
    const x = Math.floor(s.pos.x), y = Math.floor(s.pos.y), z = Math.floor(s.pos.z);
    const planks = 8;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) g.world.setBlock(x + dx, y + 3, z + dz, planks);   // roof
    for (let dy = 0; dy <= 2; dy++) { g.world.setBlock(x + 1, y + dy, z, planks); g.world.setBlock(x - 1, y + dy, z, planks); g.world.setBlock(x, y + dy, z + 1, planks); } // three walls
    const t0 = Date.now();
    while (!q.done && Date.now() - t0 < 8000) await new Promise(r => setTimeout(r, 200));
    return { species: q.speciesId, done: q.done, sheltered: g.life.isSheltered(x, y, z), points: g.guild.points };
  });
  expect(r.species).toBe('sheep'); expect(r.sheltered).toBe(true); expect(r.done).toBe(true); expect(r.points).toBe(15);
});

test('free quest: the animal is caged and still until a side stone is removed', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const g = (window as any).game;
    const q = g.guild.offer('free');
    const s = g.life.critters.find((c: any) => c.id === q.subjectId);
    const before = s.pos.clone();
    await new Promise(r => setTimeout(r, 1500));
    const movedWhileStuck = s.pos.distanceTo(before) > 0.05;
    const cageBlocks = q.cage.length;
    const x = Math.floor(s.pos.x), y = Math.floor(s.pos.y), z = Math.floor(s.pos.z);
    // Take the roof off first: not enough.
    g.world.setBlock(x, y + 2, z, 0);
    await new Promise(r => setTimeout(r, 900));
    const doneAfterRoof = q.done;
    // Open a side.
    g.world.setBlock(x + 1, y, z, 0); g.world.setBlock(x + 1, y + 1, z, 0);
    const t0 = Date.now();
    while (!q.done && Date.now() - t0 < 5000) await new Promise(r => setTimeout(r, 200));
    return { cageBlocks, movedWhileStuck, doneAfterRoof, done: q.done, stuck: s.stuck, friendly: s.friendly };
  });
  expect(r.cageBlocks).toBeGreaterThanOrEqual(15);
  expect(r.movedWhileStuck).toBe(false);
  expect(r.doneAfterRoof).toBe(false);
  expect(r.done).toBe(true); expect(r.stuck).toBe(false); expect(r.friendly).toBe(true);
});

test('habitat quest: digging a pond by the marker completes it and frogs move in', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const g = (window as any).game;
    const q = g.guild.offer('habitat', 'common-frog');
    const x = Math.floor(q.pos.x), y = Math.floor(q.pos.y) - 1, z = Math.floor(q.pos.z);
    const water = 5;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) g.world.setBlock(x + dx, y, z + dz, water);
    const t0 = Date.now();
    while (!q.done && Date.now() - t0 < 5000) await new Promise(r => setTimeout(r, 200));
    return { need: q.need, done: q.done, frogs: g.life.critters.filter((c: any) => c.sp.id === 'common-frog' && c.friendly).length, points: g.guild.points };
  });
  expect(r.need.block).toBe('water'); expect(r.done).toBe(true); expect(r.frogs).toBeGreaterThanOrEqual(2); expect(r.points).toBe(20);
});

test('rank and friends persist across reload; the seed pouch plants real plants on the right ground', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { const g = (window as any).game; g.guild.points = 35; g.guild.befriended.add('rabbit'); (g.guild as any).persist(); });
  await page.reload(); await boot(page);
  const r = await page.evaluate(() => {
    const g = (window as any).game;
    const clover = g.life.constructor.species('white-clover');
    const px = Math.floor(g.player.pos.x) + 3, pz = Math.floor(g.player.pos.z) + 3;
    const planted = g.life.plant(clover, px, pz);
    const duckOnLand = g.life.plant(g.life.constructor.species('duckweed'), px, pz);
    return { rank: g.guild.rank.name, friends: [...g.guild.befriended], planted: !!planted, growth: planted?.growth, duckOnLand: !!duckOnLand };
  });
  expect(r.rank).toBe('Warden of Small Things'); expect(r.friends).toContain('rabbit');
  expect(r.planted).toBe(true); expect(r.growth).toBeLessThan(0.1); expect(r.duckOnLand).toBe(false);
});
