import type { ClubId } from './clubs.js';
import type { TerrainKind, Vec3 } from './course.js';

export const MAX_PLAYERS = 4;
export const FILL_WINDOW_MS = 60_000;

export type QueuePlayer = {
  id: string;
  name: string;
};

export type QueueUpdate = {
  players: QueuePlayer[];
  countdownEndsAt: number | null;
  canStartSolo: boolean;
};

export type PlayerPublic = {
  id: string;
  name: string;
  strokes: number;
  holed: boolean;
  position: Vec3;
  color: string;
  lie: TerrainKind;
};

export type MatchPhase = 'intro' | 'playing' | 'scoreboard' | 'ended';

export type MatchStart = {
  matchId: string;
  players: PlayerPublic[];
  activePlayerId: string;
  phase: MatchPhase;
  par: number;
  holeName: string;
};

export type MatchState = {
  matchId: string;
  players: PlayerPublic[];
  activePlayerId: string | null;
  phase: MatchPhase;
  ballInFlight: boolean;
};

export type MatchTurn = {
  playerId: string;
  playerName: string;
  suggestedClub: ClubId;
  distanceToPin: number;
  lie: TerrainKind;
};

export type BallSample = {
  playerId: string;
  position: Vec3;
  velocity: Vec3;
  t: number;
};

export type MatchBall = {
  playerId: string;
  samples: BallSample[];
  finalPosition: Vec3;
  terrain: TerrainKind;
  holed: boolean;
  waterHazard: boolean;
  foul: boolean;
  penaltyStrokes: number;
  gimme: boolean;
};

export type MatchBanner = {
  kind: TerrainKind | 'holed' | 'turn' | 'stroke_limit' | 'gimme' | 'penalty';
  text: string;
  playerId?: string;
};

export type MatchScoreboard = {
  players: Array<{
    id: string;
    name: string;
    strokes: number;
    holed: boolean;
  }>;
  par: number;
};

export type MatchShot = {
  yaw: number;
  power: number; // 0.01..0.99
  clubId: ClubId;
};

export const Events = {
  Hello: 'hello',
  QueueJoin: 'queue:join',
  QueueLeave: 'queue:leave',
  QueueStartSolo: 'queue:startSolo',
  MatchAim: 'match:aim',
  MatchShot: 'match:shot',
  MatchReady: 'match:ready',

  Welcome: 'welcome',
  QueueUpdate: 'queue:update',
  MatchStart: 'match:start',
  MatchState: 'match:state',
  MatchTurn: 'match:turn',
  MatchBall: 'match:ball',
  MatchBanner: 'match:banner',
  MatchScoreboard: 'match:scoreboard',
  MatchEnd: 'match:end',
  MatchAimBroadcast: 'match:aimBroadcast',
  Error: 'error',
} as const;

export const PLAYER_COLORS = ['#e8f0ff', '#ff6b4a', '#5ec8ff', '#ffe066'] as const;
