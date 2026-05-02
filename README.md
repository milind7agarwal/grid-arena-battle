# Shared Grid Arena (https://grid-arena-battle-production.up.railway.app)

A real-time multiplayer tile-capture board. Open the app in multiple tabs or browsers and claim cells; ownership updates instantly for everyone.

## Why this stack

- **Backend:** Node.js + Express keeps the server simple and fast for this size project.
- **Real-time layer:** Native WebSockets (`ws`) for low-latency pub/sub updates.
- **Frontend:** Lightweight vanilla JS + modern CSS for a clean, responsive UI without framework overhead.
- **State model:** Server-authoritative in-memory grid to avoid client desync and race condition issues.

## Features

- 30x20 board (600 tiles)
- Live tile claiming synced to all connected clients
- Per-user identity (auto name/color + rename)
- Conflict-safe ownership updates (server decides all claims)
- Short claim cooldown to reduce spam
- Live online counter and leaderboard
- Tile ownership tooltips and capture micro-animation

## Run locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

If port 3000 is busy:

```bash
PORT=3001 npm run dev
```

## Real-time architecture notes

1. A user connects via WebSocket and receives:
   - Their identity
   - Grid dimensions/config
   - Full current tile state
   - Current leaderboard and online count
2. On click, client emits `{ type: "claim", index }`.
3. Server validates tile index and cooldown, then applies claim atomically in the single Node event loop.
4. Server broadcasts only the changed tile (`tile:update`) plus refreshed leaderboard.
5. All clients patch local state and repaint only what changed.

This pattern keeps bandwidth low and keeps all clients in sync under concurrent usage.
