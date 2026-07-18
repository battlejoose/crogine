import * as THREE from 'three';
import type { Socket } from 'socket.io-client';
import {
  Events,
  type ClubId,
  type MatchBall,
  type MatchBanner,
  type MatchScoreboard,
  type MatchStart,
  type MatchState,
  type MatchTurn,
  type QueueUpdate,
} from '@webgolf/shared';
import { createSocket } from '../net/socket.js';
import { LobbyUI } from '../ui/lobby.js';
import { HudUI } from '../ui/hud.js';
import { BannerUI } from '../ui/banners.js';
import { CourseView } from './Course.js';
import { BallView } from './BallView.js';
import { CameraDirector } from './CameraDirector.js';
import { InputAim } from './InputAim.js';

export class GameApp {
  private socket: Socket;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private course!: CourseView;
  private director!: CameraDirector;
  private input: InputAim;
  private lobby: LobbyUI;
  private hud: HudUI;
  private banners: BannerUI;

  private myId: string | null = null;
  private myName = '';
  private match: MatchState | null = null;
  private lastTurn: MatchTurn | null = null;
  private balls = new Map<string, BallView>();
  private flight: {
    samples: MatchBall['samples'];
    index: number;
    playerId: string;
    startWall: number;
  } | null = null;
  private lastActiveId: string | null = null;
  private clock = new THREE.Clock();
  private aimLine: THREE.Line;
  private preparedForTurn: string | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private overlay: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.director = new CameraDirector(this.camera);
    this.course = new CourseView(this.scene);

    const aimGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ]);
    this.aimLine = new THREE.Line(
      aimGeo,
      new THREE.LineBasicMaterial({ color: 0xe8c468, transparent: true, opacity: 0.85 }),
    );
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);

    this.input = new InputAim(canvas);
    this.lobby = new LobbyUI(overlay, {
      onJoinQueue: (name) => this.joinQueue(name),
      onLeaveQueue: () => this.socket.emit(Events.QueueLeave),
      onStartSolo: (name) => this.startSolo(name),
    });
    this.hud = new HudUI(overlay);
    this.banners = new BannerUI(overlay);

    this.socket = createSocket();
    this.bindSocket();
    this.input.mount(
      (yaw, power, clubId) => {
        this.socket.emit(Events.MatchShot, { yaw, power, clubId });
        this.input.enabled = false;
        this.hud.setPowerVisible(false);
        this.aimLine.visible = false;
      },
      (yaw) => {
        this.socket.emit(Events.MatchAim, { yaw });
        this.director.updateAimYaw(yaw);
        this.updateAimLine();
      },
      (_clubId: ClubId) => {
        this.hud.setClub(this.input.getClubLabel());
        this.director.putting = this.input.clubId === 'putter';
        this.updateAimLine();
      },
    );

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private bindSocket() {
    this.socket.on(Events.Welcome, (p: { id: string; name: string }) => {
      this.myId = p.id;
      this.myName = p.name;
      this.lobby.setDefaultName(p.name);
    });

    this.socket.on(Events.QueueUpdate, (u: QueueUpdate) => {
      this.lobby.setQueue(u);
    });

    this.socket.on(Events.MatchStart, (m: MatchStart) => {
      this.enterMatch(m);
    });

    this.socket.on(Events.MatchState, (s: MatchState) => {
      this.match = s;
      this.syncBalls(s);
      this.hud.updateState(s, this.myId);
      if (s.phase === 'playing' && !s.ballInFlight) {
        this.maybeEnableAim(s);
      }
    });

    this.socket.on(Events.MatchTurn, (t: MatchTurn) => {
      this.lastTurn = t;
      this.preparedForTurn = null;
      this.banners.show({ kind: 'turn', text: `${t.playerName}'s turn`, playerId: t.playerId }, 2000);
      const ball = this.balls.get(t.playerId);
      if (ball && this.lastActiveId && this.lastActiveId !== t.playerId) {
        const from = this.balls.get(this.lastActiveId)?.mesh.position ?? ball.mesh.position;
        this.director.startTransition(from.clone(), ball.mesh.position.clone());
      } else if (ball) {
        this.prepareInputFor(t, ball.mesh.position);
        this.director.setAim(ball.mesh.position.clone(), this.input.yaw);
      }
      this.lastActiveId = t.playerId;
    });

    this.socket.on(Events.MatchBall, (b: MatchBall) => {
      this.input.enabled = false;
      this.aimLine.visible = false;
      this.hud.setPowerVisible(false);
      this.preparedForTurn = null;
      this.flight = {
        samples: b.samples,
        index: 0,
        playerId: b.playerId,
        startWall: performance.now(),
      };
      const ball = this.balls.get(b.playerId);
      if (ball && b.samples[0]) {
        ball.setPosition(b.samples[0].position);
        this.director.startFlight(ball.mesh.position.clone());
      }
    });

    this.socket.on(Events.MatchBanner, (b: MatchBanner) => {
      const long = b.kind === 'holed' || b.kind === 'gimme' ? 2400 : 1800;
      this.banners.show(b, long);
      if (this.flight) {
        const ball = this.balls.get(this.flight.playerId);
        if (ball) this.director.startSettle(ball.mesh.position.clone());
        this.flight = null;
      }
    });

    this.socket.on(Events.MatchAimBroadcast, (p: { playerId: string; yaw: number }) => {
      if (p.playerId === this.myId) return;
      this.director.updateAimYaw(p.yaw);
      if (this.match?.activePlayerId) {
        const ball = this.balls.get(this.match.activePlayerId);
        if (ball) {
          this.director.setAim(ball.mesh.position.clone(), p.yaw);
          this.drawAimLine(ball.mesh.position, p.yaw);
        }
      }
    });

    this.socket.on(Events.MatchScoreboard, (board: MatchScoreboard) => {
      this.input.enabled = false;
      this.aimLine.visible = false;
      this.director.startScoreboard();
      this.banners.showScoreboard(board);
    });

    this.socket.on(Events.MatchEnd, () => {
      this.exitMatch();
    });

    this.socket.on(Events.Error, (e: { message: string }) => {
      this.banners.show({ kind: 'turn', text: e.message }, 2500);
    });
  }

  private joinQueue(name: string) {
    if (name.length >= 2) {
      this.socket.emit(Events.Hello, { name });
      this.myName = name;
    }
    this.socket.emit(Events.QueueJoin);
  }

  private startSolo(name: string) {
    if (name.length >= 2) {
      this.socket.emit(Events.Hello, { name });
      this.myName = name;
    }
    this.socket.emit(Events.QueueStartSolo);
  }

  private enterMatch(m: MatchStart) {
    this.lobby.hide();
    this.banners.clear();
    this.clearBalls();
    this.lastTurn = null;
    this.preparedForTurn = null;
    this.match = {
      matchId: m.matchId,
      players: m.players,
      activePlayerId: m.activePlayerId,
      phase: m.phase,
      ballInFlight: false,
    };
    for (const p of m.players) {
      this.balls.set(p.id, new BallView(p, this.scene));
    }
    this.hud.show(m.holeName, m.par);
    this.director.startIntro();
    this.lastActiveId = null;

    window.setTimeout(() => {
      this.socket.emit(Events.MatchReady);
    }, 5600);
  }

  private exitMatch() {
    this.match = null;
    this.lastTurn = null;
    this.flight = null;
    this.preparedForTurn = null;
    this.input.enabled = false;
    this.aimLine.visible = false;
    this.hud.hide();
    this.banners.clear();
    this.clearBalls();
    this.lobby.show();
    this.lobby.setQueue({ players: [], countdownEndsAt: null, canStartSolo: false });
  }

  private clearBalls() {
    for (const b of this.balls.values()) b.dispose(this.scene);
    this.balls.clear();
  }

  private syncBalls(s: MatchState) {
    for (const p of s.players) {
      let ball = this.balls.get(p.id);
      if (!ball) {
        ball = new BallView(p, this.scene);
        this.balls.set(p.id, ball);
      }
      if (!this.flight || this.flight.playerId !== p.id) {
        ball.setPosition(p.position);
      }
      ball.setVisible(!p.holed || !!this.flight);
      if (p.holed && !this.flight) ball.setVisible(false);
    }
  }

  private prepareInputFor(t: MatchTurn, ballPos: THREE.Vector3) {
    this.input.prepareTurn(ballPos, this.course.pinWorld, t.lie, t.suggestedClub);
    this.director.putting = this.input.clubId === 'putter';
    this.hud.setClub(this.input.getClubLabel());
    this.preparedForTurn = t.playerId;
  }

  private maybeEnableAim(s: MatchState) {
    const isMe = s.activePlayerId === this.myId;
    const ball = s.activePlayerId ? this.balls.get(s.activePlayerId) : undefined;
    if (!ball) return;

    if (this.director.mode === 'transition' && !this.director.transitionComplete) {
      return;
    }

    if (this.lastTurn && this.preparedForTurn !== this.lastTurn.playerId) {
      this.prepareInputFor(this.lastTurn, ball.mesh.position);
    }

    this.director.setAim(ball.mesh.position.clone(), this.input.yaw);
    this.updateAimLine();

    if (isMe && !s.ballInFlight) {
      this.input.enabled = true;
      this.aimLine.visible = true;
      this.hud.setClub(this.input.getClubLabel());
      this.hud.setAimHint('Drag aim/power · Q/E club · release to swing');
      this.hud.setPower(0, false);
    } else {
      this.input.enabled = false;
      this.aimLine.visible = true;
      this.hud.setAimHint(isMe ? '' : 'Watching…');
      this.hud.setPowerVisible(false);
    }
  }

  private updateAimLine() {
    const id = this.match?.activePlayerId;
    if (!id) return;
    const ball = this.balls.get(id);
    if (!ball) return;
    const len = this.input.clubId === 'putter' ? 4 : 14;
    this.drawAimLine(ball.mesh.position, this.input.yaw, len);
  }

  private drawAimLine(origin: THREE.Vector3, yaw: number, len = 12) {
    const end = new THREE.Vector3(
      origin.x + Math.sin(yaw) * len,
      origin.y + 0.05,
      origin.z - Math.cos(yaw) * len,
    );
    const start = origin.clone();
    start.y += 0.05;
    this.aimLine.geometry.setFromPoints([start, end]);
    this.aimLine.visible = true;
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());

    if (this.flight) {
      const elapsed = (performance.now() - this.flight.startWall) / 1000;
      const samples = this.flight.samples;
      while (
        this.flight.index < samples.length - 1 &&
        samples[this.flight.index + 1].t <= elapsed
      ) {
        this.flight.index += 1;
      }
      const a = samples[this.flight.index];
      const b = samples[Math.min(this.flight.index + 1, samples.length - 1)];
      const span = Math.max(0.0001, b.t - a.t);
      const u = THREE.MathUtils.clamp((elapsed - a.t) / span, 0, 1);
      const ball = this.balls.get(this.flight.playerId);
      if (ball) {
        ball.mesh.position.set(
          THREE.MathUtils.lerp(a.position.x, b.position.x, u),
          THREE.MathUtils.lerp(a.position.y, b.position.y, u),
          THREE.MathUtils.lerp(a.position.z, b.position.z, u),
        );
        this.director.followFlight(ball.mesh.position.clone());
      }
    }

    if (this.input.enabled && this.input.charging) {
      this.hud.setPower(this.input.power, true);
    }

    if (
      this.match?.phase === 'playing' &&
      !this.match.ballInFlight &&
      this.director.mode === 'transition' &&
      this.director.transitionComplete
    ) {
      this.maybeEnableAim(this.match);
    }

    this.director.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
