import { Server, Socket } from 'socket.io';
import {
  BALL_TURN_DELAY,
  COURSE,
  Events,
  PLAYER_COLORS,
  autoSelectClub,
  horizontalDist,
  isClubId,
  terrainAt,
  terrainLabel,
  type ClubId,
  type MatchBanner,
  type MatchScoreboard,
  type MatchShot,
  type MatchStart,
  type MatchState,
  type PlayerPublic,
  type TerrainKind,
  type Vec3,
} from '@webgolf/shared';
import { simulateShot } from './physics.js';

export type MatchPlayer = {
  id: string;
  name: string;
  socketId: string;
  strokes: number;
  holed: boolean;
  position: Vec3;
  color: string;
  lie: TerrainKind;
};

export type MatchRoom = {
  id: string;
  players: MatchPlayer[];
  activeIndex: number;
  phase: 'intro' | 'playing' | 'scoreboard' | 'ended';
  ballInFlight: boolean;
  introDone: Set<string>;
};

const matches = new Map<string, MatchRoom>();
const socketToMatch = new Map<string, string>();

function teeBall(): Vec3 {
  return { x: COURSE.tee.x, y: COURSE.tee.y, z: COURSE.tee.z };
}

function toPublic(p: MatchPlayer): PlayerPublic {
  return {
    id: p.id,
    name: p.name,
    strokes: p.strokes,
    holed: p.holed,
    position: { ...p.position },
    color: p.color,
    lie: p.lie,
  };
}

function snapshot(m: MatchRoom): MatchState {
  return {
    matchId: m.id,
    players: m.players.map(toPublic),
    activePlayerId: m.players[m.activeIndex]?.id ?? null,
    phase: m.phase,
    ballInFlight: m.ballInFlight,
  };
}

function emitRoom(io: Server, m: MatchRoom, event: string, payload: unknown) {
  for (const p of m.players) {
    io.to(p.socketId).emit(event, payload);
  }
}

function pickNextActive(m: MatchRoom): number {
  const active = m.players.filter((p) => !p.holed);
  if (active.length === 0) return -1;
  const allAtTee = active.every((p) => p.strokes === 0);
  if (allAtTee) {
    return m.players.findIndex((p) => p.id === active[0].id);
  }
  active.sort(
    (a, b) => horizontalDist(b.position, COURSE.pin) - horizontalDist(a.position, COURSE.pin),
  );
  return m.players.findIndex((p) => p.id === active[0].id);
}

function finishMatch(io: Server, m: MatchRoom) {
  m.phase = 'scoreboard';
  m.ballInFlight = false;
  const board: MatchScoreboard = {
    par: COURSE.par,
    players: m.players
      .map((p) => ({
        id: p.id,
        name: p.name,
        strokes: p.strokes,
        holed: p.holed,
      }))
      .sort((a, b) => {
        if (a.holed !== b.holed) return a.holed ? -1 : 1;
        return a.strokes - b.strokes;
      }),
  };
  emitRoom(io, m, Events.MatchScoreboard, board);
  emitRoom(io, m, Events.MatchState, snapshot(m));

  setTimeout(() => {
    m.phase = 'ended';
    emitRoom(io, m, Events.MatchEnd, { matchId: m.id });
    for (const p of m.players) socketToMatch.delete(p.socketId);
    matches.delete(m.id);
  }, 8000);
}

function emitTurn(io: Server, m: MatchRoom) {
  const active = m.players[m.activeIndex];
  if (!active) return;
  const dist = horizontalDist(active.position, COURSE.pin);
  const suggested = autoSelectClub(dist, active.lie, dist < 10 && active.lie === 'fairway');
  const banner: MatchBanner = {
    kind: 'turn',
    text: `${active.name}'s turn`,
    playerId: active.id,
  };
  emitRoom(io, m, Events.MatchBanner, banner);
  emitRoom(io, m, Events.MatchTurn, {
    playerId: active.id,
    playerName: active.name,
    suggestedClub: suggested,
    distanceToPin: dist,
    lie: active.lie,
  });
  emitRoom(io, m, Events.MatchState, snapshot(m));
}

function advanceTurn(io: Server, m: MatchRoom) {
  if (m.players.every((p) => p.holed || p.strokes >= COURSE.strokeCap)) {
    finishMatch(io, m);
    return;
  }
  const next = pickNextActive(m);
  if (next < 0) {
    finishMatch(io, m);
    return;
  }
  m.activeIndex = next;
  m.phase = 'playing';
  emitTurn(io, m);
}

export function createMatch(
  io: Server,
  members: Array<{ id: string; name: string; socketId: string }>,
): MatchRoom {
  const id = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const players: MatchPlayer[] = members.map((mem, i) => ({
    id: mem.id,
    name: mem.name,
    socketId: mem.socketId,
    strokes: 0,
    holed: false,
    position: teeBall(),
    color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    lie: 'tee' as TerrainKind,
  }));

  const room: MatchRoom = {
    id,
    players,
    activeIndex: 0,
    phase: 'intro',
    ballInFlight: false,
    introDone: new Set(),
  };

  matches.set(id, room);
  for (const p of players) socketToMatch.set(p.socketId, id);

  const start: MatchStart = {
    matchId: id,
    players: players.map(toPublic),
    activePlayerId: players[0].id,
    phase: 'intro',
    par: COURSE.par,
    holeName: COURSE.name,
  };
  emitRoom(io, room, Events.MatchStart, start);
  emitRoom(io, room, Events.MatchState, snapshot(room));

  setTimeout(() => {
    if (room.phase === 'intro' && matches.has(id)) advanceTurn(io, room);
  }, 6500);

  return room;
}

export function getMatchForSocket(socketId: string): MatchRoom | undefined {
  const id = socketToMatch.get(socketId);
  return id ? matches.get(id) : undefined;
}

export function handleMatchReady(io: Server, socket: Socket) {
  const m = getMatchForSocket(socket.id);
  if (!m || m.phase !== 'intro') return;
  const player = m.players.find((p) => p.socketId === socket.id);
  if (!player) return;
  m.introDone.add(player.id);
  if (m.introDone.size >= m.players.length) advanceTurn(io, m);
}

export function handleMatchAim(io: Server, socket: Socket, yaw: number) {
  const m = getMatchForSocket(socket.id);
  if (!m || m.phase !== 'playing' || m.ballInFlight) return;
  const active = m.players[m.activeIndex];
  if (!active || active.socketId !== socket.id) return;
  emitRoom(io, m, Events.MatchAimBroadcast, { playerId: active.id, yaw });
}

export function handleMatchShot(io: Server, socket: Socket, shot: MatchShot) {
  const m = getMatchForSocket(socket.id);
  if (!m || m.phase !== 'playing' || m.ballInFlight) return;
  const active = m.players[m.activeIndex];
  if (!active || active.socketId !== socket.id || active.holed) return;

  const clubId: ClubId = isClubId(shot.clubId) ? shot.clubId : 'iron7';
  // Putter only on green / fringe
  const dist = horizontalDist(active.position, COURSE.pin);
  let club = clubId;
  if (club === 'putter' && active.lie !== 'green' && !(active.lie === 'fairway' && dist < 10)) {
    club = autoSelectClub(dist, active.lie, false);
  }
  if (active.lie === 'green') club = 'putter';

  const power = Math.min(0.99, Math.max(0.01, shot.power));
  m.ballInFlight = true;
  active.strokes += 1;

  const result = simulateShot(active.position, shot.yaw, power, club);
  active.position = { ...result.finalPosition };
  active.lie = result.terrain;
  active.strokes += result.penaltyStrokes;

  if (result.holed || result.gimme) {
    active.holed = true;
    active.lie = 'green';
  } else if (active.strokes >= COURSE.strokeCap) {
    active.holed = true;
  }

  emitRoom(io, m, Events.MatchBall, {
    playerId: active.id,
    samples: result.samples,
    finalPosition: result.finalPosition,
    terrain: result.terrain,
    holed: result.holed,
    waterHazard: result.waterHazard,
    foul: result.foul,
    penaltyStrokes: result.penaltyStrokes,
    gimme: result.gimme,
  });
  emitRoom(io, m, Events.MatchState, snapshot(m));

  const flightMs = Math.min(14000, (result.samples.at(-1)?.t ?? 2) * 1000 + 200);

  setTimeout(() => {
    if (!matches.has(m.id)) return;

    let kind: MatchBanner['kind'] = result.terrain;
    let text = terrainLabel(result.terrain);

    if (result.gimme) {
      kind = 'gimme';
      text = 'Gimme!';
    } else if (result.holed) {
      kind = 'holed';
      text = `${active.name} holes out!`;
    } else if (result.waterHazard) {
      kind = 'water';
      text = 'Water hazard — drop (+1)';
    } else if (result.foul) {
      kind = 'penalty';
      text = 'Out of bounds — drop (+1)';
    } else if (active.strokes >= COURSE.strokeCap && !result.holed) {
      kind = 'stroke_limit';
      text = 'Stroke limit';
    }

    emitRoom(io, m, Events.MatchBanner, {
      kind,
      text,
      playerId: active.id,
    });
    m.ballInFlight = false;

    setTimeout(() => {
      if (!matches.has(m.id)) return;
      advanceTurn(io, m);
    }, BALL_TURN_DELAY * 1000);
  }, flightMs);
}

export function handleDisconnectFromMatch(io: Server, socket: Socket) {
  const m = getMatchForSocket(socket.id);
  if (!m) return;

  const idx = m.players.findIndex((p) => p.socketId === socket.id);
  if (idx < 0) return;
  const [removed] = m.players.splice(idx, 1);
  socketToMatch.delete(socket.id);

  if (m.players.length === 0) {
    matches.delete(m.id);
    return;
  }

  if (m.activeIndex >= m.players.length) m.activeIndex = 0;
  else if (idx < m.activeIndex) m.activeIndex -= 1;
  else if (idx === m.activeIndex) {
    m.ballInFlight = false;
    advanceTurn(io, m);
  }

  emitRoom(io, m, Events.MatchBanner, {
    kind: 'turn',
    text: `${removed.name} left the match`,
  });
  emitRoom(io, m, Events.MatchState, snapshot(m));

  if (m.players.every((p) => p.holed)) finishMatch(io, m);
}
