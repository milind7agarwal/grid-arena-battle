import express from "express";
import { createServer } from "http";
import { randomUUID } from "crypto";
import { WebSocketServer } from "ws";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const GRID_WIDTH = 30;
const GRID_HEIGHT = 20;
const TOTAL_TILES = GRID_WIDTH * GRID_HEIGHT;
const CLAIM_COOLDOWN_MS = 350;

const users = new Map();
const tiles = Array.from({ length: TOTAL_TILES }, () => null);
const lastClaimAt = new Map();

app.use(express.static("public"));

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const NAME_PREFIXES = [
  "Crimson",
  "Solar",
  "Misty",
  "Neon",
  "Pixel",
  "Turbo",
  "Nova",
  "Lime",
  "Violet",
  "Cobalt"
];

const NAME_SUFFIXES = [
  "Falcon",
  "Tiger",
  "Otter",
  "Raven",
  "Comet",
  "Wisp",
  "Fox",
  "Drift",
  "Spark",
  "Wave"
];

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#f43f5e"
];

function buildStats() {
  const scoreByUser = new Map();
  for (const ownerId of tiles) {
    if (!ownerId) continue;
    scoreByUser.set(ownerId, (scoreByUser.get(ownerId) || 0) + 1);
  }
  return Array.from(scoreByUser.entries())
    .map(([id, score]) => {
      const user = users.get(id);
      if (!user) return null;
      return { id, name: user.name, color: user.color, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

function tilesPayload() {
  return tiles.map((ownerId) => {
    if (!ownerId) return null;
    const user = users.get(ownerId);
    return user
      ? { id: user.id, name: user.name, color: user.color }
      : null;
  });
}

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastPresence() {
  broadcast({
    type: "presence",
    onlineCount: users.size
  });
}

function generateUser() {
  const id = randomUUID();
  const name = `${randomFrom(NAME_PREFIXES)} ${randomFrom(NAME_SUFFIXES)}`;
  const color = randomFrom(COLORS);
  return { id, name, color };
}

wss.on("connection", (ws) => {
  const user = generateUser();
  users.set(user.id, user);

  ws.send(
    JSON.stringify({
      type: "welcome",
      user,
      config: {
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
        cooldownMs: CLAIM_COOLDOWN_MS
      },
      state: {
        tiles: tilesPayload(),
        leaderboard: buildStats()
      },
      onlineCount: users.size
    })
  );

  broadcastPresence();

  ws.on("message", (raw) => {
    const data = safeJsonParse(raw.toString());
    if (!data || typeof data.type !== "string") return;

    if (data.type === "rename" && typeof data.name === "string") {
      const trimmed = data.name.trim().slice(0, 20);
      if (trimmed.length >= 2) {
        const oldName = user.name;
        user.name = trimmed;
        broadcast({
          type: "user:update",
          user: { id: user.id, name: user.name, color: user.color },
          oldName,
          leaderboard: buildStats(),
          tiles: tilesPayload()
        });
      }
      return;
    }

    if (data.type !== "claim" || typeof data.index !== "number") return;
    const index = Math.floor(data.index);
    if (index < 0 || index >= TOTAL_TILES) return;

    const now = Date.now();
    const last = lastClaimAt.get(user.id) || 0;
    if (now - last < CLAIM_COOLDOWN_MS) {
      ws.send(
        JSON.stringify({
          type: "claim:rejected",
          reason: "cooldown",
          retryInMs: CLAIM_COOLDOWN_MS - (now - last)
        })
      );
      return;
    }

    if (tiles[index] === user.id) return;

    lastClaimAt.set(user.id, now);
    tiles[index] = user.id;

    broadcast({
      type: "tile:update",
      index,
      owner: { id: user.id, name: user.name, color: user.color },
      leaderboard: buildStats()
    });
  });

  ws.on("close", () => {
    users.delete(user.id);
    lastClaimAt.delete(user.id);
    broadcastPresence();
    broadcast({
      type: "leaderboard:update",
      leaderboard: buildStats()
    });
  });
});

server.listen(PORT, () => {
  console.log(`Shared grid arena running on http://localhost:${PORT}`);
});
