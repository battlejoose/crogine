import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { Events, type MatchShot } from '@webgolf/shared';
import {
  handleDisconnectFromMatch,
  handleMatchAim,
  handleMatchReady,
  handleMatchShot,
  getMatchForSocket,
} from './match.js';
import {
  handleDisconnectFromQueue,
  joinQueue,
  leaveQueue,
  startSolo,
} from './queue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);

type Session = {
  id: string;
  name: string;
};

const sessions = new Map<string, Session>();

function randomName(): string {
  const adjectives = ['Calm', 'Swift', 'Bold', 'Lucky', 'Quiet', 'Bright', 'Steady', 'Wild'];
  const nouns = ['Iron', 'Wedge', 'Putter', 'Eagle', 'Birdie', 'Fairway', 'Links', 'Pine'];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  const n = nouns[Math.floor(Math.random() * nouns.length)];
  return `${a}${n}${Math.floor(Math.random() * 90 + 10)}`;
}

const app = express();
app.use(cors());

const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  const session: Session = {
    id: `p_${socket.id.slice(0, 8)}`,
    name: randomName(),
  };
  sessions.set(socket.id, session);
  socket.emit(Events.Welcome, { id: session.id, name: session.name });

  socket.on(Events.Hello, (payload: { name?: string }) => {
    if (payload?.name && typeof payload.name === 'string') {
      const trimmed = payload.name.trim().slice(0, 20);
      if (trimmed.length >= 2) session.name = trimmed;
    }
    socket.emit(Events.Welcome, { id: session.id, name: session.name });
  });

  socket.on(Events.QueueJoin, () => {
    if (getMatchForSocket(socket.id)) return;
    joinQueue(io, socket, session);
  });

  socket.on(Events.QueueLeave, () => {
    leaveQueue(io, socket);
  });

  socket.on(Events.QueueStartSolo, () => {
    if (getMatchForSocket(socket.id)) return;
    startSolo(io, socket, session);
  });

  socket.on(Events.MatchReady, () => {
    handleMatchReady(io, socket);
  });

  socket.on(Events.MatchAim, (payload: { yaw?: number }) => {
    if (typeof payload?.yaw === 'number') {
      handleMatchAim(io, socket, payload.yaw);
    }
  });

  socket.on(Events.MatchShot, (payload: MatchShot) => {
    if (
      payload &&
      typeof payload.yaw === 'number' &&
      typeof payload.power === 'number' &&
      typeof payload.clubId === 'string'
    ) {
      handleMatchShot(io, socket, payload);
    }
  });

  socket.on('disconnect', () => {
    handleDisconnectFromQueue(io, socket);
    handleDisconnectFromMatch(io, socket);
    sessions.delete(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Webgolf server listening on http://localhost:${PORT}`);
});
