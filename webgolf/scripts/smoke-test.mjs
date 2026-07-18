import { io } from 'socket.io-client';

const URL = 'http://localhost:3001';

function client(name) {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'] });
    const log = [];
    const api = {
      s,
      log,
      wait(event, timeout = 5000) {
        return new Promise((res, rej) => {
          const t = setTimeout(() => rej(new Error(`timeout waiting ${event} (${name})`)), timeout);
          s.once(event, (payload) => {
            clearTimeout(t);
            log.push([event, payload]);
            res(payload);
          });
        });
      },
    };
    s.on('connect', () => resolve(api));
    s.on('connect_error', reject);
  });
}

const a = await client('A');
const welcomeA = await a.wait('welcome');
a.s.emit('hello', { name: 'Alpha' });
a.s.emit('queue:join');
const q1 = await a.wait('queue:update');
console.log('solo canStartSolo', q1.canStartSolo, 'players', q1.players.length);
if (!q1.canStartSolo || q1.players.length !== 1) throw new Error('expected solo queue state');

const b = await client('B');
await b.wait('welcome');
b.s.emit('hello', { name: 'Bravo' });
b.s.emit('queue:join');

const qA = await a.wait('queue:update');
const qB = await b.wait('queue:update');
console.log('countdown A', !!qA.countdownEndsAt, 'players', qA.players.length);
console.log('countdown B', !!qB.countdownEndsAt, 'players', qB.players.length);
if (!qA.countdownEndsAt || qA.players.length !== 2) throw new Error('expected 60s fill window');

// leave B — timer should cancel
b.s.emit('queue:leave');
const qAfter = await a.wait('queue:update');
console.log('after leave countdown', qAfter.countdownEndsAt, 'players', qAfter.players.length);
if (qAfter.countdownEndsAt != null || qAfter.players.length !== 1) {
  throw new Error('countdown should cancel below 2');
}

// solo start
a.s.emit('queue:startSolo');
const match = await a.wait('match:start', 3000);
console.log('solo match', match.holeName, 'players', match.players.length);
if (match.players.length !== 1) throw new Error('solo match should have 1 player');

const turn = await a.wait('match:turn', 8000);
console.log('suggested club', turn.suggestedClub, 'lie', turn.lie);
a.s.emit('match:shot', { yaw: 0, power: 0.02, clubId: turn.suggestedClub });
const ball = await a.wait('match:ball', 5000);
console.log('shot terrain', ball.terrain, 'samples', ball.samples.length);

a.s.disconnect();
b.s.disconnect();
console.log('SMOKE OK');
process.exit(0);
