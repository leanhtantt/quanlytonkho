// Interactive transactions that can replay FIFO batches or process many lines.
// Neon adds network latency, so Prisma's 5s default is not enough for these flows.
export const HEAVY_TX_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;
