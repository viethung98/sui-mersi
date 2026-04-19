import pino from "pino";
import { Writable } from "stream";
import { env } from "./env.js";

const isProduction = env.NODE_ENV === "production";

function toLevel(pinoLevel: number): string {
  if (pinoLevel >= 60) return "fatal";
  if (pinoLevel >= 50) return "error";
  if (pinoLevel >= 40) return "warn";
  if (pinoLevel >= 30) return "info";
  if (pinoLevel >= 20) return "debug";
  return "trace";
}

function buildBetterStackStream(): Writable | null {
  if (!env.BETTERSTACK_SOURCE_TOKEN) return null;

  const ingestUrl = env.BETTERSTACK_INGESTING_HOST
    ? `https://${env.BETTERSTACK_INGESTING_HOST}`
    : "https://in.logs.betterstack.com";

  const token = env.BETTERSTACK_SOURCE_TOKEN;
  let buffer: object[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  async function flush() {
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, buffer.length);
    try {
      await fetch(ingestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(batch),
      });
    } catch {
      // losing logs is acceptable — crashing the server is not
    }
  }

  flushTimer = setInterval(flush, 1000);
  if (flushTimer.unref) flushTimer.unref();

  return new Writable({
    write(chunk: Buffer, _enc: string, cb: () => void) {
      const line = chunk.toString().trim();
      if (line) {
        try {
          const { msg, message, level, time, v: _v, ...meta } = JSON.parse(line);
          buffer.push({
            dt: time ?? new Date().toISOString(),
            level: toLevel(level as number),
            message: msg ?? message ?? "",
            ...meta,
          });
          if (buffer.length >= 100) {
            void flush();
          }
        } catch {
          // malformed line — skip
        }
      }
      cb();
    },
    final(cb: () => void) {
      if (flushTimer) clearInterval(flushTimer);
      flush().then(() => cb()).catch(() => cb());
    },
  });
}

export function createLogger(service: string): pino.Logger {
  const level = env.LOG_LEVEL;
  const base = { service };
  const timestamp = pino.stdTimeFunctions.isoTime;

  const betterStackStream = buildBetterStackStream();

  if (!betterStackStream) {
    if (isProduction) return pino({ level, base, timestamp });
    return pino({
      level,
      base,
      timestamp,
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
      },
    });
  }

  const streams: pino.StreamEntry[] = [
    { stream: betterStackStream, level: "info" as pino.Level },
  ];

  if (!isProduction) {
    const pretty = require("pino-pretty") as (opts: object) => NodeJS.WritableStream; // eslint-disable-line @typescript-eslint/no-require-imports
    streams.unshift({
      stream: pretty({ colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" }),
      level: level as pino.Level,
    });
  } else {
    streams.unshift({ stream: process.stdout, level: level as pino.Level });
  }

  return pino({ level, base, timestamp }, pino.multistream(streams));
}

const logger = createLogger("comagent");

export default logger;
