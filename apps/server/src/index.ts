import http from "node:http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { boardsRouter } from "./boards-api.js";
import { setupConnection } from "./connection.js";
import { getBoardMeta } from "./redis.js";
import { rooms } from "./room.js";
import { closeRedis } from "./redis.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: config.corsOrigins.length ? config.corsOrigins : true,
    methods: ["GET", "POST", "PATCH", "PUT"],
    allowedHeaders: ["Content-Type", "x-owner-token"],
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", boardsRouter);

const server = http.createServer(app);

// WebSocket endpoint: wss://host/board/:id
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", async (request, socket, head) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(/^\/board\/([^/]+)$/);
    if (!match) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      return socket.destroy();
    }

    const boardId = decodeURIComponent(match[1]);

    // The board must already exist (created via REST). No silent auto-create
    // here, so a mistyped/expired id can't resurrect a dead board.
    const meta = await getBoardMeta(boardId);
    if (!meta) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      return socket.destroy();
    }

    // Identity from the query string: the owner token proves ownership; uid is
    // the self-asserted user id used for per-user draw grants.
    const token = url.searchParams.get("token") ?? "";
    const uid = url.searchParams.get("uid") ?? "";
    const isOwner = token.length > 0 && token === meta.ownerToken;

    wss.handleUpgrade(request, socket, head, (ws) => {
      void setupConnection(ws, boardId, { isOwner, uid });
    });
  } catch (err) {
    console.error("[upgrade] error", err);
    socket.destroy();
  }
});

server.listen(config.port, () => {
  console.log(`Sync-Canvas server listening on :${config.port}`);
  console.log(`  HTTP  http://localhost:${config.port}/health`);
  console.log(`  WS    ws://localhost:${config.port}/board/:id`);
});

// --- graceful shutdown ---
async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  wss.clients.forEach((c) => c.close());
  await rooms.closeAll();
  await closeRedis();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
