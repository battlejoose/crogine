import * as THREE from 'three';
import {
  CLUB_BY_ID,
  autoSelectClub,
  clubTargetForShot,
  nextClub,
  type ClubId,
  type TerrainKind,
} from '@webgolf/shared';

export type AimState = {
  yaw: number;
  power: number;
  charging: boolean;
  clubId: ClubId;
};

/**
 * Aim + power + club select.
 * - Drag L/R: aim
 * - Drag up/down: power 1%–99% (SVG MinPower/MaxPower)
 * - Q / E or [ / ]: previous / next club
 * - Auto club on turn start; putter forced on green
 */
export class InputAim {
  yaw = 0;
  power = 0;
  charging = false;
  enabled = false;
  clubId: ClubId = 'iron7';

  private pointerDown = false;
  private startX = 0;
  private startY = 0;
  private baseYaw = 0;
  private lie: TerrainKind = 'tee';
  private distPin = 95;
  private onShoot: ((yaw: number, power: number, clubId: ClubId) => void) | null = null;
  private onAim: ((yaw: number) => void) | null = null;
  private onClub: ((clubId: ClubId) => void) | null = null;
  private lastAimEmit = 0;

  constructor(private el: HTMLElement) {
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  mount(
    onShoot: (yaw: number, power: number, clubId: ClubId) => void,
    onAim: (yaw: number) => void,
    onClub: (clubId: ClubId) => void,
  ) {
    this.onShoot = onShoot;
    this.onAim = onAim;
    this.onClub = onClub;
    this.el.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  unmount() {
    this.el.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  prepareTurn(ball: THREE.Vector3, pin: THREE.Vector3, lie: TerrainKind, suggested?: ClubId) {
    const dx = pin.x - ball.x;
    const dz = pin.z - ball.z;
    this.yaw = Math.atan2(dx, -dz);
    this.distPin = Math.hypot(dx, dz);
    this.lie = lie;
    this.power = 0;
    this.charging = false;
    const allowPutter = lie === 'green' || (lie === 'fairway' && this.distPin < 10);
    this.clubId = suggested ?? autoSelectClub(this.distPin, lie, allowPutter);
    if (lie === 'green') this.clubId = 'putter';
    this.onClub?.(this.clubId);
  }

  getClubLabel(): string {
    const c = CLUB_BY_ID[this.clubId];
    const t = clubTargetForShot(c, this.distPin);
    if (t < 1) return `${c.name} ${Math.round(t * 100)}cm`;
    return `${c.name} · ${Math.round(t)}m`;
  }

  get state(): AimState {
    return { yaw: this.yaw, power: this.power, charging: this.charging, clubId: this.clubId };
  }

  private cycle(dir: 1 | -1) {
    if (!this.enabled) return;
    if (this.lie === 'green') {
      this.clubId = 'putter';
      this.onClub?.(this.clubId);
      return;
    }
    const allowPutter = this.lie === 'fairway' && this.distPin < 10;
    this.clubId = nextClub(this.clubId, dir, allowPutter);
    this.onClub?.(this.clubId);
  }

  private onPointerDown(e: PointerEvent) {
    if (!this.enabled) return;
    this.pointerDown = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.baseYaw = this.yaw;
    this.charging = true;
    this.power = 0.01;
    this.el.setPointerCapture?.(e.pointerId);
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.enabled || !this.pointerDown) return;
    const dx = e.clientX - this.startX;
    const dy = this.startY - e.clientY;
    this.yaw = this.baseYaw + dx * 0.004;
    // Full 1%–99% range from a modest drag (SVG MinPower/MaxPower)
    this.power = THREE.MathUtils.clamp(dy / 320, 0.01, 0.99);

    const now = performance.now();
    if (now - this.lastAimEmit > 50) {
      this.lastAimEmit = now;
      this.onAim?.(this.yaw);
    }
  }

  private onPointerUp() {
    if (!this.enabled || !this.pointerDown) return;
    this.pointerDown = false;
    if (this.charging && this.power >= 0.01) {
      this.onShoot?.(this.yaw, this.power, this.clubId);
    }
    this.charging = false;
    this.power = 0;
  }

  private onKeyDown(e: KeyboardEvent) {
    if (!this.enabled) return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      this.yaw -= 0.04;
      this.onAim?.(this.yaw);
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      this.yaw += 0.04;
      this.onAim?.(this.yaw);
    }
    if (e.key === 'q' || e.key === 'Q' || e.key === '[') this.cycle(-1);
    if (e.key === 'e' || e.key === 'E' || e.key === ']') this.cycle(1);
  }
}
