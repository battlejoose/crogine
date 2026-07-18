# Webgolf

Cinematic 1-hole multiplayer golf built with **Three.js** and a **Node + Socket.io** authoritative server. Real players only — no AI. Solo means you play the hole alone.

## Features (MVP)

- Public matchmaking queue
- **Solo**: join and press **Play alone** / **Start alone now**
- **Public**: when 2 players are queued, a **60s** fill timer starts; others can join until the timer ends or the lobby hits **4** players
- Turn-based stroke play on a single par-3 hole
- Server-side ball physics; cinematic intro / aim / flight / transition cameras

## Setup

```bash
cd webgolf
npm install   # also generates placeholder PNGs under client/public/assets
npm run dev
```

> Note: the repo root `.gitignore` ignores folders named `assets`, so placeholders are generated on install via `npm run assets` rather than committed.

- Client: http://localhost:5173  
- Server: http://localhost:3001  

Open two browser tabs to test the public queue countdown. Use **Play alone** for a solo round.

## Controls

- **Drag left/right** to aim  
- **Pull up / down** while holding to set power (**1%–99%**)  
- **Release** to swing  
- **Q / E** or **[ / ]** to change club (full bag; putter forced on the green)  
- **A / D** or arrow keys nudge aim  

Gameplay constants (clubs, cup attract, friction, water drop +1) are ported from Super Video Golf.  

## Replace assets later

Course meshes and materials are procedural placeholders under the client (`Course.ts`). Drop replacement textures / models into [`client/public/assets/`](client/public/assets/) when ready — keep paths stable and wire them in `Course.ts`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Client + server with hot reload |
| `npm run build` | Build shared, client, and server |
| `npm start` | Serve production build from the server |

## Layout

```
webgolf/
  client/   Vite + Three.js
  server/   Express + Socket.io game authority
  shared/   Course layout + protocol types
```
