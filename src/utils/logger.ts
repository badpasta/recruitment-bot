function timestamp(): string {
  return new Date().toISOString();
}

export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export function createLogger(module: string): Logger {
  const prefix = `[${module}]`;
  return {
    info(msg: string, ...args: unknown[]) {
      console.log(`${timestamp()} ${prefix} ${msg}`, ...args);
    },
    warn(msg: string, ...args: unknown[]) {
      console.warn(`${timestamp()} ${prefix} ⚠ ${msg}`, ...args);
    },
    error(msg: string, ...args: unknown[]) {
      console.error(`${timestamp()} ${prefix} ✗ ${msg}`, ...args);
    },
  };
}
