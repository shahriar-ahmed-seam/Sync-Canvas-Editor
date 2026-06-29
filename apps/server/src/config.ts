/**
 * Central runtime configuration, read once from the environment.
 */
export const config = {
  port: Number(process.env.PORT ?? 1234),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  snapshotIntervalMs: Number(process.env.SNAPSHOT_INTERVAL_MS ?? 10_000),
  boardTtlSeconds: Number(process.env.BOARD_TTL_SECONDS ?? 0),
};

export type AppConfig = typeof config;
