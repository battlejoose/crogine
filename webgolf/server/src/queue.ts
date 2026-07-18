import { Server, Socket } from 'socket.io';
import {
  Events,
  FILL_WINDOW_MS,
  MAX_PLAYERS,
  type QueuePlayer,
  type QueueUpdate,
} from '@webgolf/shared';
import { createMatch } from './match.js';

type Queued = {
  id: string;
  name: string;
  socketId: string;
};

const queue: Queued[] = [];
let countdownEndsAt: number | null = null;
let countdownTimer: ReturnType<typeof setTimeout> | null = null;

function toPublic(): QueuePlayer[] {
  return queue.map((q) => ({ id: q.id, name: q.name }));
}

function broadcast(io: Server) {
  const payload: QueueUpdate = {
    players: toPublic(),
    countdownEndsAt,
    canStartSolo: queue.length === 1,
  };
  for (const q of queue) {
    io.to(q.socketId).emit(Events.QueueUpdate, payload);
  }
}

function clearCountdown() {
  if (countdownTimer) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }
  countdownEndsAt = null;
}

function startMatchFromQueue(io: Server) {
  clearCountdown();
  if (queue.length === 0) return;

  const members = queue.splice(0, MAX_PLAYERS);
  createMatch(io, members);
  broadcast(io);

  // If leftovers somehow remain (shouldn't with splice of all up to max),
  // re-evaluate countdown for remaining queue.
  maybeStartCountdown(io);
}

function maybeStartCountdown(io: Server) {
  if (queue.length >= MAX_PLAYERS) {
    startMatchFromQueue(io);
    return;
  }
  if (queue.length >= 2) {
    if (countdownEndsAt != null) {
      broadcast(io);
      return;
    }
    countdownEndsAt = Date.now() + FILL_WINDOW_MS;
    countdownTimer = setTimeout(() => {
      countdownTimer = null;
      countdownEndsAt = null;
      startMatchFromQueue(io);
    }, FILL_WINDOW_MS);
    broadcast(io);
    return;
  }
  // fewer than 2
  clearCountdown();
  broadcast(io);
}

export function isInQueue(socketId: string): boolean {
  return queue.some((q) => q.socketId === socketId);
}

export function joinQueue(io: Server, socket: Socket, player: { id: string; name: string }) {
  if (queue.some((q) => q.socketId === socket.id)) {
    broadcast(io);
    return;
  }
  if (queue.length >= MAX_PLAYERS && countdownEndsAt != null) {
    socket.emit(Events.Error, { message: 'Match is filling — try again in a moment.' });
    return;
  }

  queue.push({
    id: player.id,
    name: player.name,
    socketId: socket.id,
  });
  maybeStartCountdown(io);
}

export function leaveQueue(io: Server, socket: Socket) {
  const idx = queue.findIndex((q) => q.socketId === socket.id);
  if (idx < 0) return;
  queue.splice(idx, 1);
  maybeStartCountdown(io);
}

export function startSolo(io: Server, socket: Socket, player: { id: string; name: string }) {
  // Ensure this socket is the only one we're launching (or alone in queue)
  const idx = queue.findIndex((q) => q.socketId === socket.id);
  if (idx >= 0) {
    // Only allow solo if alone
    if (queue.length !== 1) {
      socket.emit(Events.Error, {
        message: 'Cannot start solo while a public fill is in progress.',
      });
      return;
    }
    const [member] = queue.splice(0, 1);
    clearCountdown();
    createMatch(io, [member]);
    broadcast(io);
    return;
  }

  // Not in queue — start immediately as solo
  createMatch(io, [{ id: player.id, name: player.name, socketId: socket.id }]);
}

export function handleDisconnectFromQueue(io: Server, socket: Socket) {
  leaveQueue(io, socket);
}
