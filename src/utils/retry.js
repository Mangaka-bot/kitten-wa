export async function retry(fn, options = {}) {
  const {
    maxAttempts = 20,
    backoff = (attempt) => Math.min(500 * attempt, 30_000),
    shouldRetry = () => true,
    onRetry = () => {},
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts || !shouldRetry(err, attempt)) {
        throw err;
      }

      onRetry(err, attempt);
      await wait(backoff(attempt));
    }
  }

  throw lastError;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));