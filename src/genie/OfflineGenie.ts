import type { GenieBackend } from './GenieAgent';
import type { GenieEvent, GenieRequest, ToolCall, BlockName, Vec3 } from '../../shared/genie-tools';
import { BLOCK_NAMES } from '../../shared/genie-tools';
import { SPECIES } from '../../shared/taxonomy';
import { ELEMENTS } from '../../shared/chemistry';

/**
 * No-backend fallback so the game is playable before Supabase/Claude are wired.
 * Understands a handful of shapes. It is deliberately dumb; the real genie is the Edge Function.
 */
export class OfflineGenie implements GenieBackend {
  async *step(req: GenieRequest): AsyncIterable<GenieEvent> {
    const last = [...req.messages].reverse().find((m: any) => m.role === 'user' && typeof m.content === 'string') as any;
    const text: string = (last?.content ?? '').toLowerCase();
    const say = (t: string): GenieEvent => ({ type: 'text', delta: t });
    const calls: ToolCall[] = [];
    let id = 0;
    const call = <N extends ToolCall['name']>(name: N, input: ToolCall<N>['input']) => calls.push({ id: `off_${++id}`, name, input } as ToolCall);

    const color = (BLOCK_NAMES.find(b => b !== 'air' && text.includes(b)) ?? null) as BlockName | null;
    const c = req.context;
    const base: Vec3 = c.target ?? { x: Math.round(c.player.x + c.facing.x * 6), y: c.surfaceY, z: Math.round(c.player.z + c.facing.z * 6) };
    const groundY = c.target ? c.target.y : c.surfaceY;
    const y0 = groundY + 1;

    const creature = SPECIES.find(sp => sp.tier === 'macro' && (text.includes(sp.common.toLowerCase()) || text.includes(sp.binomial.toLowerCase()) || text.includes(sp.common.toLowerCase().split(' ').pop()!)));
    // Iterate on the last thing built: recolour, grow, raise, remove.
    const lastBuild = req.context.builds?.[req.context.builds.length - 1];
    const refersBack = /\b(it|that|the (house|tower|wall|tree|ball|rainbow|roof|thing|last one))\b/.test(text) && !/build|make (me )?a\b|spawn|bring/.test(text);
    if (lastBuild && refersBack) {
      const last = lastBuild;
      const box = { from: last.min, to: last.max };
      const h = last.max.y - last.min.y + 1;
      if (color && /colou?r|paint|make it|turn it/.test(text)) {
        yield say(`Repainting it ${color}!`);
        for (const b of Object.keys(last.blocks)) if (b !== color && b !== 'air') call('replace', { ...box, find: b as BlockName, block: color });
      } else if (/taller|higher|raise/.test(text)) {
        const main = (Object.entries(last.blocks).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'planks') as BlockName;
        yield say('Up it goes!');
        call('fill', { from: { x: last.min.x, y: last.max.y + 1, z: last.min.z }, to: { x: last.max.x, y: last.max.y + Math.max(2, Math.round(h * 0.5)), z: last.max.z }, block: main, hollow: true });
      } else if (/bigger|wider|larger/.test(text)) {
        const main = (Object.entries(last.blocks).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'planks') as BlockName;
        yield say('Bigger — stretching the walls!');
        call('fill', { from: { x: last.min.x - 1, y: last.min.y, z: last.min.z - 1 }, to: { x: last.max.x + 1, y: last.max.y, z: last.max.z + 1 }, block: main, hollow: true });
        call('clear', { from: { x: last.min.x, y: last.min.y, z: last.min.z }, to: { x: last.max.x, y: last.max.y - 1, z: last.max.z } });
      } else if (/remove|delete|get rid|destroy|clear/.test(text)) {
        yield say('Gone in a puff of glitter.'); call('clear', box);
      } else if (/door|window|hole|open/.test(text)) {
        const cx = Math.round((last.min.x + last.max.x) / 2);
        yield say('Cutting an opening on the near side.');
        call('clear', { from: { x: cx, y: last.min.y, z: last.min.z }, to: { x: cx, y: last.min.y + 1, z: last.min.z } });
      } else {
        yield say(`I remember "${last.wish}" — try "make it taller", "make it blue", "bigger", "add a door", or "remove it". The real genie (with a Claude key) can do anything you ask.`);
      }
      for (const tc of calls) yield { type: 'tool_call', call: tc };
      yield { type: 'turn_end', stopReason: 'end_turn', assistantMessage: { role: 'assistant', content: [{ type: 'text', text: '(offline genie iterated)' }] } };
      return;
    }

    if (/undo|oops|wrong|take it back/.test(text)) { yield say('Poof — undone!'); call('undo', { steps: 1 }); }
    else if (/atom|element|give me (some )?[a-z]+$/.test(text) && ELEMENTS.some(e => new RegExp(`\\b(${e.symbol.toLowerCase()}|${e.name})\\b`).test(text))) {
      const el = ELEMENTS.filter(e => new RegExp(`\\b(${e.symbol.toLowerCase()}|${e.name})\\b`).test(text)).sort((a, b) => b.name.length - a.name.length)[0];
      const n = Math.min(12, Number((text.match(/\d+/) ?? ['3'])[0]) || 3);
      yield say(`${el.symbol} — ${el.name}. ${n} atoms, coming down!`); call('give_element', { symbol: el.symbol, count: n });
    }
    else if (/what (is|are|lives)|who('s| is) (that|there)|identify/.test(text)) { yield say('Let me look…'); call('identify', { radius: 16 }); }
    else if (creature) { const n = Math.min(8, Number((text.match(/\d+/) ?? ['1'])[0]) || 1); yield say(`${creature.binomial} — ${creature.common}! Here ${n > 1 ? 'they come' : 'it comes'}.`); call('spawn_creature', { species: creature.id, count: n }); }
    else if (/house|home|hut|cabin/.test(text)) {
      yield say('One cozy house, coming up!');
      const w = color ?? 'planks';
      call('fill', { from: { x: base.x - 3, y: y0, z: base.z - 3 }, to: { x: base.x + 3, y: y0 + 3, z: base.z + 3 }, block: w, hollow: true });
      call('fill', { from: { x: base.x - 4, y: y0 + 4, z: base.z - 4 }, to: { x: base.x + 4, y: y0 + 4, z: base.z + 4 }, block: 'brick' });
      call('fill', { from: { x: base.x - 3, y: y0 + 5, z: base.z - 3 }, to: { x: base.x + 3, y: y0 + 5, z: base.z + 3 }, block: 'brick' });
      call('fill', { from: { x: base.x - 2, y: y0 + 6, z: base.z - 2 }, to: { x: base.x + 2, y: y0 + 6, z: base.z + 2 }, block: 'brick' });
      call('clear', { from: { x: base.x, y: y0, z: base.z - 3 }, to: { x: base.x, y: y0 + 1, z: base.z - 3 } });
      call('set_block', { pos: { x: base.x - 3, y: y0 + 1, z: base.z }, block: 'glass' });
      call('set_block', { pos: { x: base.x + 3, y: y0 + 1, z: base.z }, block: 'glass' });
    } else if (/tree/.test(text)) {
      yield say('Growing a tree for you!');
      call('cylinder', { base: { x: base.x, y: y0, z: base.z }, radius: 0, height: 5, block: 'wood' });
      call('sphere', { center: { x: base.x, y: y0 + 6, z: base.z }, radius: 3, block: (color ?? 'leaves') });
    } else if (/tower|castle/.test(text)) {
      yield say('A tower fit for royalty!');
      call('cylinder', { base: { x: base.x, y: y0, z: base.z }, radius: 4, height: 12, block: color ?? 'cobble', hollow: true });
      call('cylinder', { base: { x: base.x, y: y0 + 12, z: base.z }, radius: 5, height: 1, block: 'stone' });
    } else if (/rainbow/.test(text)) {
      yield say('Rainbow time!');
      const cols: BlockName[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
      cols.forEach((b, i) => {
        const r = 12 - i;
        const cx = base.x, cz = base.z;
        for (let a = 0; a < 6; a++) {
          const t0 = (a / 6) * Math.PI, t1 = ((a + 1) / 6) * Math.PI;
          call('line', { from: { x: Math.round(cx + Math.cos(t0) * r), y: Math.round(y0 + Math.sin(t0) * r), z: cz }, to: { x: Math.round(cx + Math.cos(t1) * r), y: Math.round(y0 + Math.sin(t1) * r), z: cz }, block: b });
        }
      });
    } else if (/ball|sphere|orb/.test(text)) {
      yield say('One shiny orb!');
      call('sphere', { center: { x: base.x, y: y0 + 4, z: base.z }, radius: 4, block: color ?? 'diamond' });
    } else if (/wall/.test(text)) {
      yield say('Wall, rising!');
      call('fill', { from: { x: base.x - 5, y: y0, z: base.z }, to: { x: base.x + 5, y: y0 + 3, z: base.z }, block: color ?? 'brick' });
    } else if (/clear|flatten|remove/.test(text)) {
      yield say('Clearing the way!');
      call('clear', { from: { x: base.x - 6, y: y0, z: base.z - 6 }, to: { x: base.x + 6, y: y0 + 12, z: base.z + 6 } });
    } else {
      yield say("I'm the offline genie — I only know house, tree, tower, rainbow, ball, wall, clear, undo, and creatures by name (try “a fox” or “three rabbits”). Connect me to Claude and I'll build anything!");
    }

    for (const tc of calls) yield { type: 'tool_call', call: tc };
    // Offline genie never needs a second step.
    yield { type: 'turn_end', stopReason: 'end_turn', assistantMessage: { role: 'assistant', content: [{ type: 'text', text: '(offline genie acted)' }] } };
  }
}
