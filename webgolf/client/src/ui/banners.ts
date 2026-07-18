import type { MatchBanner, MatchScoreboard } from '@webgolf/shared';

export class BannerUI {
  private banner: HTMLElement;
  private scoreRoot: HTMLElement;
  private hideTimer = 0;

  constructor(overlay: HTMLElement) {
    this.banner = document.createElement('div');
    this.banner.className = 'banner';
    overlay.appendChild(this.banner);

    this.scoreRoot = document.createElement('div');
    this.scoreRoot.className = 'scoreboard hidden';
    overlay.appendChild(this.scoreRoot);
  }

  show(b: MatchBanner, durationMs = 1800) {
    this.banner.textContent = b.text;
    this.banner.classList.add('show');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.banner.classList.remove('show');
    }, durationMs);
  }

  showScoreboard(board: MatchScoreboard) {
    this.scoreRoot.classList.remove('hidden');
    const rows = board.players
      .map(
        (p, i) => `
        <div class="score-row">
          <div class="name"><span>${i + 1}.</span> ${escapeHtml(p.name)}${
            p.holed ? '' : ' <span style="color:var(--muted)">(DNF)</span>'
          }</div>
          <strong>${p.strokes}</strong>
        </div>`,
      )
      .join('');
    this.scoreRoot.innerHTML = `
      <div class="scoreboard-card">
        <h2>Final</h2>
        <p class="par">Par ${board.par} · returning to lobby soon</p>
        <div class="score-rows">${rows}</div>
      </div>
    `;
  }

  hideScoreboard() {
    this.scoreRoot.classList.add('hidden');
    this.scoreRoot.innerHTML = '';
  }

  clear() {
    this.banner.classList.remove('show');
    this.hideScoreboard();
  }
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
