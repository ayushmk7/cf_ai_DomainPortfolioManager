export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number },
): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 150;
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (i + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Retry attempts exhausted");
}
