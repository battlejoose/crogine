import type { MatchState } from '@webgolf/shared';

export class HudUI {
  private root: HTMLElement;
  private holeEl!: HTMLElement;
  private subEl!: HTMLElement;
  private clubEl!: HTMLElement;
  private powerWrap!: HTMLElement;
  private powerFill!: HTMLElement;
  private powerValue!: HTMLElement;
  private aimHint!: HTMLElement;
  private par = 3;

  constructor(overlay: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud hidden';
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-meta">
          <div class="hole" data-hole>Hole 1</div>
          <div class="sub" data-sub></div>
        </div>
        <div class="hud-meta club-panel">
          <div class="club" data-club>Club</div>
          <div class="sub">Q / E change club</div>
        </div>
      </div>
      <div class="hud-bottom">
        <div class="power-wrap" data-power>
          <div class="power-label"><span>Power</span><span data-power-val>0%</span></div>
          <div class="power-track"><div class="power-fill" data-fill></div></div>
        </div>
        <div class="aim-hint" data-hint></div>
      </div>
    `;
    overlay.appendChild(this.root);
    this.holeEl = this.root.querySelector('[data-hole]')!;
    this.subEl = this.root.querySelector('[data-sub]')!;
    this.clubEl = this.root.querySelector('[data-club]')!;
    this.powerWrap = this.root.querySelector('[data-power]')!;
    this.powerFill = this.root.querySelector('[data-fill]')!;
    this.powerValue = this.root.querySelector('[data-power-val]')!;
    this.aimHint = this.root.querySelector('[data-hint]')!;
  }

  show(holeName: string, par: number) {
    this.par = par;
    this.root.classList.remove('hidden');
    this.holeEl.textContent = holeName;
    this.subEl.textContent = `Par ${par}`;
  }

  hide() {
    this.root.classList.add('hidden');
    this.setPowerVisible(false);
  }

  updateState(state: MatchState, meId: string | null) {
    const me = state.players.find((p) => p.id === meId);
    const active = state.players.find((p) => p.id === state.activePlayerId);
    const parts = [`Par ${this.par}`];
    if (me) parts.push(`You ${me.strokes}`);
    if (active) parts.push(`${active.name}'s turn`);
    if (active) parts.push(active.lie);
    this.subEl.textContent = parts.join(' · ');
  }

  setClub(label: string) {
    this.clubEl.textContent = label;
  }

  setPower(power: number, visible: boolean) {
    this.setPowerVisible(visible);
    const pct = Math.round(power * 100);
    this.powerFill.style.width = `${pct}%`;
    this.powerValue.textContent = `${pct}%`;
  }

  setPowerVisible(v: boolean) {
    this.powerWrap.classList.toggle('visible', v);
  }

  setAimHint(text: string) {
    this.aimHint.textContent = text;
  }
}
