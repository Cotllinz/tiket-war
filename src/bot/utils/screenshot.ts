import type { Page } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const SCREENSHOTS_DIR = resolve(process.cwd(), 'screenshots');

// Ensure screenshots directory exists
if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

/**
 * Take a screenshot with timestamp and label
 */
export async function takeScreenshot(
  page: Page,
  label: string,
  workerId: string = 'default'
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${workerId}_${label}_${timestamp}.png`;
  const filepath = resolve(SCREENSHOTS_DIR, filename);

  await page.screenshot({
    path: filepath,
    fullPage: false,
  });

  return filepath;
}

/**
 * Take a screenshot of the full page
 */
export async function takeFullScreenshot(
  page: Page,
  label: string,
  workerId: string = 'default'
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${workerId}_${label}_full_${timestamp}.png`;
  const filepath = resolve(SCREENSHOTS_DIR, filename);

  await page.screenshot({
    path: filepath,
    fullPage: true,
  });

  return filepath;
}

/**
 * Get latest screenshot as base64 (for dashboard WebSocket)
 */
export async function getScreenshotBase64(page: Page): Promise<string> {
  const buffer = await page.screenshot({ fullPage: false });
  return buffer.toString('base64');
}
