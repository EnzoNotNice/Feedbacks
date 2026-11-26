function formatTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export const logger = {
  info(scope: string, message: string): void {
    console.log(`[${formatTimestamp()}] [INFO] [${scope}] ${message}`);
  },
  success(scope: string, message: string): void {
    console.log(`[${formatTimestamp()}] [OK] [${scope}] ${message}`);
  },
  warn(scope: string, message: string): void {
    console.warn(`[${formatTimestamp()}] [WARN] [${scope}] ${message}`);
  },
  error(scope: string, message: string, error?: unknown): void {
    if (error instanceof Error) {
      console.error(`[${formatTimestamp()}] [ERROR] [${scope}] ${message} - ${error.message}`);
      return;
    }
    if (error !== undefined) {
      console.error(`[${formatTimestamp()}] [ERROR] [${scope}] ${message}`, error);
      return;
    }
    console.error(`[${formatTimestamp()}] [ERROR] [${scope}] ${message}`);
  },
};
