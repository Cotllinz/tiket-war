import pino from 'pino';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

// Ensure logs directory exists
const logsDir = resolve(process.cwd(), 'logs');
mkdirSync(logsDir, { recursive: true });

// Event emitter for dashboard WebSocket
type LogListener = (entry: LogEntry) => void;
const listeners: LogListener[] = [];

export interface LogEntry {
  level: string;
  time: number;
  worker?: string;
  phase?: string;
  msg: string;
  [key: string]: unknown;
}

export function onLog(listener: LogListener) {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function emitLog(entry: LogEntry) {
  listeners.forEach((l) => l(entry));
}

// Create base logger
const logger = pino({
  level: 'debug',
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        level: 'info',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          messageFormat: '{worker} | {phase} | {msg}',
        },
      },
      {
        target: 'pino/file',
        level: 'debug',
        options: {
          destination: resolve(logsDir, `war-${new Date().toISOString().slice(0, 10)}.log`),
          mkdir: true,
        },
      },
    ],
  },
});

// Create child logger for a specific worker
export function createWorkerLogger(workerId: string) {
  const child = logger.child({ worker: workerId });

  // Wrap methods to also emit to WebSocket
  const wrap = (level: string, originalFn: Function) => {
    return (obj: any, msg?: string) => {
      const message = typeof obj === 'string' ? obj : msg || '';
      const extra = typeof obj === 'object' ? obj : {};
      
      emitLog({
        level,
        time: Date.now(),
        worker: workerId,
        phase: extra.phase || '',
        msg: message,
        ...extra,
      });

      if (typeof obj === 'string') {
        originalFn.call(child, obj);
      } else {
        originalFn.call(child, obj, msg);
      }
    };
  };

  return {
    info: wrap('info', child.info.bind(child)),
    warn: wrap('warn', child.warn.bind(child)),
    error: wrap('error', child.error.bind(child)),
    debug: wrap('debug', child.debug.bind(child)),
    fatal: wrap('fatal', child.fatal.bind(child)),
  };
}

export default logger;
