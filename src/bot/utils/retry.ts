import type { Page } from 'playwright';

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    delay: number;
    onRetry?: (error: Error, attempt: number) => void;
  }
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < options.maxRetries) {
        options.onRetry?.(lastError, attempt);
        const waitTime = options.delay * Math.pow(1.5, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError!;
}

/**
 * Try multiple selectors and return the first one found
 */
export async function findFirstSelector(
  page: Page,
  selectors: string[],
  timeout: number = 5000
): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const element = await page.waitForSelector(selector, { timeout: Math.min(timeout, 2000) });
      if (element) return selector;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Wait for any of the given selectors to appear
 */
export async function waitForAnySelector(
  page: Page,
  selectors: string[],
  timeout: number = 30000
): Promise<{ selector: string; index: number }> {
  const promises = selectors.map((selector, index) =>
    page.waitForSelector(selector, { timeout })
      .then(() => ({ selector, index }))
      .catch(() => null)
  );

  const result = await Promise.race(promises.filter(Boolean));
  if (!result) {
    throw new Error(`None of the selectors found within ${timeout}ms: ${selectors.join(', ')}`);
  }
  return result;
}

/**
 * Safe click — waits for selector, scrolls into view, then clicks
 */
export async function safeClick(page: Page, selector: string, timeout: number = 10000): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout, state: 'visible' });
    await page.click(selector, { force: false, timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe fill — waits for selector then fills
 */
export async function safeFill(page: Page, selector: string, value: string, timeout: number = 10000): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout, state: 'visible' });
    await page.fill(selector, value);
    return true;
  } catch {
    return false;
  }
}
