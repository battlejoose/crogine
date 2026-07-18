import { io, Socket } from 'socket.io-client';

const url = import.meta.env.DEV ? undefined : undefined;

export function createSocket(): Socket {
  // In dev, Vite proxies /socket.io to the game server.
  return io(url, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });
}
