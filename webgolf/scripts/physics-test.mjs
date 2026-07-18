import { createRequire } from 'node:module';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Use tsx programmatic loader via spawning is easier — just import compiled via dynamic tsx
const { simulateShot } = await import('../server/src/physics.ts');
const { COURSE, BALL_RADIUS, groundHeight, horizontalDist } = await import('../shared/src/index.ts');

const near = { x: 0.15, y: groundHeight(0.15, COURSE.pin.z) + BALL_RADIUS, z: COURSE.pin.z };
const yawNear = Math.atan2(COURSE.pin.x - near.x, -(COURSE.pin.z - near.z));
const putt = simulateShot(near, yawNear, 0.4, 'putter');
console.log('near putt', {
  holed: putt.holed,
  gimme: putt.gimme,
  terrain: putt.terrain,
  dist: horizontalDist(putt.finalPosition, COURSE.pin).toFixed(3),
});

const gim = { x: 0.4, y: groundHeight(0.4, COURSE.pin.z) + BALL_RADIUS, z: COURSE.pin.z };
const g = simulateShot(gim, 0, 0.08, 'putter');
console.log('gimme', {
  holed: g.holed,
  gimme: g.gimme,
  dist: horizontalDist(g.finalPosition, COURSE.pin).toFixed(3),
});

const tee = { ...COURSE.tee };
const soft = simulateShot(tee, 0, 0.01, 'iron8');
const mid = simulateShot(tee, 0, 0.5, 'iron8');
console.log('power', {
  p01z: soft.finalPosition.z.toFixed(1),
  p50z: mid.finalPosition.z.toFixed(1),
  t01: soft.terrain,
  t50: mid.terrain,
});

const water = simulateShot(tee, -0.4, 0.6, 'iron7');
console.log('water', {
  water: water.waterHazard,
  foul: water.foul,
  pen: water.penaltyStrokes,
  terrain: water.terrain,
});

const green = { x: 1.0, y: COURSE.green.height + BALL_RADIUS, z: COURSE.pin.z };
const run = simulateShot(green, Math.PI, 0.45, 'putter');
console.log('green run', {
  holed: run.holed,
  gimme: run.gimme,
  finalDist: horizontalDist(run.finalPosition, COURSE.pin).toFixed(3),
  terrain: run.terrain,
});
