import type { QueueUpdate } from '@webgolf/shared';

export type LobbyHandlers = {
  onJoinQueue: (name: string) => void;
  onLeaveQueue: () => void;
  onStartSolo: (name: string) => void;
};

export class LobbyUI {
  private root: HTMLElement;
  private nameInput!: HTMLInputElement;
  private joinBtn!: HTMLButtonElement;
  private soloBtn!: HTMLButtonElement;
  private leaveBtn!: HTMLButtonElement;
  private status!: HTMLElement;
  private countdownEl!: HTMLElement;
  private listEl!: HTMLUListElement;
  private hintEl!: HTMLElement;
  private inQueue = false;
  private raf = 0;
  private endsAt: number | null = null;

  constructor(
    private overlay: HTMLElement,
    private handlers: LobbyHandlers,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'lobby';
    this.root.innerHTML = `
      <div class="lobby-card">
        <h1 class="brand">WEBGOLF</h1>
        <p class="tagline">One hole. Real players. Cinematic turns.</p>
        <div class="field">
          <label for="name">Your name</label>
          <input id="name" maxlength="20" placeholder="Golfer" autocomplete="nickname" />
        </div>
        <div class="actions">
          <button class="primary" type="button" data-join>Find public match</button>
          <button class="ghost" type="button" data-solo>Play alone</button>
          <button class="ghost hidden" type="button" data-leave>Leave queue</button>
        </div>
        <div class="queue-status hidden" data-status>
          <h2>Public queue</h2>
          <div class="countdown" data-countdown></div>
          <ul class="player-list" data-list></ul>
          <p class="hint" data-hint></p>
        </div>
      </div>
    `;
    this.overlay.appendChild(this.root);
    this.nameInput = this.root.querySelector('#name')!;
    this.joinBtn = this.root.querySelector('[data-join]')!;
    this.soloBtn = this.root.querySelector('[data-solo]')!;
    this.leaveBtn = this.root.querySelector('[data-leave]')!;
    this.status = this.root.querySelector('[data-status]')!;
    this.countdownEl = this.root.querySelector('[data-countdown]')!;
    this.listEl = this.root.querySelector('[data-list]')!;
    this.hintEl = this.root.querySelector('[data-hint]')!;

    this.joinBtn.addEventListener('click', () => {
      this.handlers.onJoinQueue(this.nameInput.value.trim());
    });
    this.soloBtn.addEventListener('click', () => {
      this.handlers.onStartSolo(this.nameInput.value.trim());
    });
    this.leaveBtn.addEventListener('click', () => {
      this.handlers.onLeaveQueue();
    });
  }

  setDefaultName(name: string) {
    if (!this.nameInput.value) this.nameInput.value = name;
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
    this.stopCountdownTick();
  }

  setQueue(update: QueueUpdate) {
    this.inQueue = update.players.length > 0;
    this.status.classList.toggle('hidden', !this.inQueue);
    this.leaveBtn.classList.toggle('hidden', !this.inQueue);
    this.joinBtn.classList.toggle('hidden', this.inQueue);
    this.soloBtn.disabled = this.inQueue && !update.canStartSolo;
    this.soloBtn.textContent = update.canStartSolo ? 'Start alone now' : 'Play alone';

    this.listEl.innerHTML = '';
    for (const p of update.players) {
      const li = document.createElement('li');
      li.textContent = p.name;
      this.listEl.appendChild(li);
    }

    this.endsAt = update.countdownEndsAt;
    if (this.endsAt) {
      this.hintEl.textContent = 'Match fills for 60s once two players are waiting.';
      this.startCountdownTick();
    } else if (update.canStartSolo) {
      this.countdownEl.textContent = '';
      this.hintEl.textContent = 'Waiting for others — or start alone.';
      this.stopCountdownTick();
    } else if (update.players.length === 0) {
      this.countdownEl.textContent = '';
      this.hintEl.textContent = '';
      this.stopCountdownTick();
    } else {
      this.countdownEl.textContent = '';
      this.hintEl.textContent = 'Waiting for a second player…';
      this.stopCountdownTick();
    }
  }

  private startCountdownTick() {
    this.stopCountdownTick();
    const tick = () => {
      if (this.endsAt == null) return;
      const left = Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000));
      this.countdownEl.textContent = `${left}s`;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopCountdownTick() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
