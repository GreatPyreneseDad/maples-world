import * as THREE from 'three';
import type { Guild, Quest } from '../guild/Guild';
import { SPECIES_BY_ID, SPECIES, type Species } from '../../shared/taxonomy';
import { RANKS } from '../../shared/guild';

/** Guild hall panel (G) and the small quest tracker that stays on screen. */
export class GuildPanel {
  private root = document.getElementById('guild')!;
  private body = document.getElementById('guild-body')!;
  private rankEl = document.getElementById('guild-rank')!;
  private hud = document.getElementById('questhud')!;
  onAsk?: () => void;

  constructor(private guild: Guild, private playerPos: () => THREE.Vector3) {
    document.getElementById('guild-close')!.addEventListener('click', () => this.toggle(false));
    document.getElementById('guild-ask')!.addEventListener('click', () => { this.onAsk?.(); this.render(); });
  }

  get isOpen() { return !this.root.hidden; }
  toggle(open = this.root.hidden) { this.root.hidden = !open; if (open) this.render(); }

  renderHud() {
    const qs = this.guild.active;
    this.hud.hidden = qs.length === 0;
    const p = this.playerPos();
    this.hud.innerHTML = qs.map(q => `<div class="q ${q.kind}"><b>${q.title}</b><span>${q.progress || '…'}</span><small>${Math.round(q.pos.distanceTo(p))} m ${dirArrow(q.pos, p)}</small></div>`).join('') + `<div class="hint">G · guild</div>`;
  }

  render() {
    const g = this.guild;
    const next = RANKS.find(r => r.at > g.points);
    this.rankEl.innerHTML = `<b>${g.rank.name}</b> · ${g.points} pts${next ? ` · ${next.at - g.points} to ${next.name}` : ''}`;
    const card = (q: Quest) => `<div class="quest ${q.kind} ${q.done ? 'done' : ''}"><div class="k">${q.kind}</div><h4>${q.title}</h4><p>${q.brief}</p><div class="prog">${q.done ? '✓ complete' : q.progress || '…'}</div><small>${SPECIES_BY_ID[q.speciesId].fact}</small></div>`;
    const friends = [...g.befriended].map(id => SPECIES_BY_ID[id]).filter(Boolean) as Species[];
    this.body.innerHTML =
      `<section><h3>Active quests <span>${g.active.length}/3</span></h3>${g.active.map(card).join('') || '<p class="muted">The Guild has nothing for you yet — ask.</p>'}</section>` +
      `<section><h3>Friends <span>${friends.length}</span></h3>${friends.length ? friends.map(s => `<div class="friend"><i>${s.binomial}</i> ${s.common}${s.diet ? ` — loves <i>${SPECIES_BY_ID[s.diet[0]].binomial}</i>` : ''}</div>`).join('') : '<p class="muted">Help an animal and it will remember you.</p>'}</section>` +
      `<section><h3>Who eats what</h3>${SPECIES.filter(s => s.diet?.length).map(s => `<div class="friend"><b>${s.common}</b> <i>${s.binomial}</i> → ${s.diet!.map(d => `${SPECIES_BY_ID[d].common} (<i>${SPECIES_BY_ID[d].binomial}</i>)`).join(', ')}</div>`).join('')}</section>` +
      `<section><h3>Completed <span>${g.completed.length}</span></h3><p class="muted">${g.completed.length ? g.completed.map(id => id.split('-').slice(0, -2).join(' ')).join(' · ') : 'none yet'}</p></section>`;
  }
}

function dirArrow(target: THREE.Vector3, from: THREE.Vector3) {
  const a = Math.atan2(target.x - from.x, -(target.z - from.z));
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  return arrows[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}
