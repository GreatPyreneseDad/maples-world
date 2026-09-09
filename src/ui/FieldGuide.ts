import * as THREE from 'three';
import { KINGDOMS, SPECIES, type Species } from '../../shared/taxonomy';

export interface Pickable { sp: Species; pos: THREE.Vector3; radius: number }

/**
 * Nomenclature made visible. Aim at a living thing and its binomial appears; hold it for a
 * moment and it enters the journal. The journal is the game's biology textbook, written by playing.
 */
export class FieldGuide {
  discovered = new Set<string>();
  private labels: HTMLDivElement[] = [];
  private layer = document.getElementById('labels')!;
  private journal = document.getElementById('journal')!;
  private journalBody = document.getElementById('journal-body')!;
  private journalCount = document.getElementById('journal-count')!;
  private aimSince = new Map<string, number>();
  private storageKey: string;
  onDiscover?: (sp: Species) => void;
  onChange?: (ids: string[]) => void;

  constructor(worldId: string) {
    this.storageKey = `maples:journal:${worldId}`;
    try { for (const id of JSON.parse(localStorage.getItem(this.storageKey) ?? '[]')) this.discovered.add(id); } catch { /* fresh */ }
    document.getElementById('journal-close')!.addEventListener('click', () => this.toggleJournal(false));
  }

  get isJournalOpen() { return !this.journal.hidden; }
  toggleJournal(open = this.journal.hidden) { this.journal.hidden = !open; if (open) this.renderJournal(); }

  /** Merge discoveries loaded from the cloud. */
  merge(ids: string[]) { for (const id of ids) this.discovered.add(id); this.persist(false); }

  discover(sp: Species, silent = false) {
    if (this.discovered.has(sp.id)) return false;
    this.discovered.add(sp.id);
    this.persist(true);
    if (!silent) this.onDiscover?.(sp);
    return true;
  }

  private persist(notify: boolean) {
    const ids = [...this.discovered];
    try { localStorage.setItem(this.storageKey, JSON.stringify(ids)); } catch { /* quota */ }
    if (notify) this.onChange?.(ids);
    if (this.isJournalOpen) this.renderJournal();
  }

  /**
   * Draw labels. `aimed` gets a full card; with goggles on, everything nearby gets a name tag.
   * Aiming at something for 0.6 s (instantly with goggles) discovers it.
   */
  updateLabels(camera: THREE.Camera, aimed: Pickable | null, nearby: Pickable[], goggles: boolean, dt: number) {
    const items: { p: Pickable; full: boolean }[] = [];
    if (aimed) items.push({ p: aimed, full: true });
    if (goggles) for (const p of nearby) if (p !== aimed && items.length < 12) items.push({ p, full: false });

    // Discovery timer.
    if (aimed) {
      const since = (this.aimSince.get(aimed.sp.id) ?? 0) + dt;
      this.aimSince.set(aimed.sp.id, since);
      if (since > (goggles ? 0.05 : 0.6)) this.discover(aimed.sp);
    }
    for (const k of [...this.aimSince.keys()]) if (!aimed || aimed.sp.id !== k) this.aimSince.delete(k);

    while (this.labels.length < items.length) { const d = document.createElement('div'); d.className = 'label'; this.layer.appendChild(d); this.labels.push(d); }
    const v = new THREE.Vector3();
    this.labels.forEach((el, i) => {
      const it = items[i];
      if (!it) { el.hidden = true; return; }
      v.copy(it.p.pos); v.y += it.p.radius * 1.2; v.project(camera);
      if (v.z > 1) { el.hidden = true; return; }
      el.hidden = false;
      el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
      el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
      const sp = it.p.sp, known = this.discovered.has(sp.id);
      el.className = 'label' + (it.full ? ' full' : '') + (known ? ' known' : ' unknown');
      el.innerHTML = it.full
        ? `<i>${sp.binomial}</i><b>${known ? sp.common : '…identifying…'}</b><small>${sp.kingdom} · ${sp.phylum} · ${sp.klass}</small>${known ? `<p>${sp.fact}</p>` : ''}`
        : `<i>${sp.binomial}</i>${known ? `<b>${sp.common}</b>` : ''}`;
    });
  }

  hideLabels() { for (const el of this.labels) el.hidden = true; }

  renderJournal() {
    const total = SPECIES.length, n = this.discovered.size;
    this.journalCount.textContent = `${n} / ${total} species`;
    this.journalBody.innerHTML = KINGDOMS.map(k => {
      const all = SPECIES.filter(s => s.kingdom === k);
      const found = all.filter(s => this.discovered.has(s.id));
      const phyla = [...new Set(all.map(s => s.phylum))];
      return `<section><h3>${k} <span>${found.length}/${all.length}</span></h3>` +
        phyla.map(ph => {
          const rows = all.filter(s => s.phylum === ph).map(s => this.discovered.has(s.id)
            ? `<div class="sp"><i>${s.binomial}</i> <b>${s.common}</b><small>${s.klass} · ${s.tier === 'micro' ? `${s.size} µm` : `${s.size < 1 ? Math.round(s.size * 100) + ' cm' : s.size + ' m'}`}</small><p>${s.fact}</p>${s.note ? `<p class="note">${s.note}</p>` : ''}</div>`
            : `<div class="sp unknown"><i>?</i> <b>undiscovered</b><small>${s.tier === 'micro' ? 'needs a microscope' : 'look closer'}</small></div>`).join('');
          return `<h4>Phylum ${ph}</h4>${rows}`;
        }).join('') + `</section>`;
    }).join('');
  }
}
