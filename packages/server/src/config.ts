export const SERVER_HOST = process.env.HOST ?? '0.0.0.0'
export const SERVER_PORT = Number(process.env.PORT ?? 3001)

export const HEARTBEAT_INTERVAL_MS = 10_000
export const LOCK_TTL_MS = 15_000
export const SERVER_TICK_RATE = 60
