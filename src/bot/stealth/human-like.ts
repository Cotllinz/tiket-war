import { Page } from 'playwright';
import type { WarConfig } from '../../config/loader.js';

/**
 * Human-like behavior simulation module.
 * Makes browser automation appear natural to anti-bot systems.
 */

// Bezier curve helper for smooth mouse movement
function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function generateBezierPath(
  startX: number, startY: number,
  endX: number, endY: number,
  steps: number = 20
): Array<{ x: number; y: number }> {
  // Random control points for natural curve
  const cp1x = startX + (endX - startX) * (0.2 + Math.random() * 0.3);
  const cp1y = startY + (Math.random() - 0.5) * 100;
  const cp2x = startX + (endX - startX) * (0.5 + Math.random() * 0.3);
  const cp2y = endY + (Math.random() - 0.5) * 100;

  const path: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    path.push({
      x: bezierPoint(t, startX, cp1x, cp2x, endX),
      y: bezierPoint(t, startY, cp1y, cp2y, endY),
    });
  }
  return path;
}

/**
 * Random delay between min and max milliseconds
 */
export function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}

/**
 * Wait for a random human-like delay
 */
export async function humanDelay(config: WarConfig['behavior']): Promise<void> {
  const delay = randomDelay(config.min_delay, config.max_delay);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Move mouse smoothly along a bezier curve to target element
 */
export async function humanMouseMove(page: Page, selector: string): Promise<void> {
  const element = await page.$(selector);
  if (!element) return;

  const box = await element.boundingBox();
  if (!box) return;

  // Target point with random offset from center
  const targetX = box.x + box.width / 2 + (Math.random() - 0.5) * box.width * 0.3;
  const targetY = box.y + box.height / 2 + (Math.random() - 0.5) * box.height * 0.3;

  // Get current mouse position (default to random starting point)
  const startX = Math.random() * 400 + 200;
  const startY = Math.random() * 300 + 100;

  const path = generateBezierPath(startX, startY, targetX, targetY, 15 + Math.floor(Math.random() * 10));

  for (const point of path) {
    await page.mouse.move(point.x, point.y);
    await new Promise((resolve) => setTimeout(resolve, randomDelay(5, 15)));
  }
}

/**
 * Click an element with human-like behavior
 */
export async function humanClick(page: Page, selector: string, config: WarConfig['behavior']): Promise<void> {
  if (config.human_mouse) {
    await humanMouseMove(page, selector);
  }

  // Small delay before clicking (human reaction time)
  await new Promise((resolve) => setTimeout(resolve, randomDelay(50, 150)));

  // Click with random offset
  const element = await page.$(selector);
  if (element) {
    const box = await element.boundingBox();
    if (box) {
      const offsetX = (Math.random() - 0.5) * box.width * 0.4;
      const offsetY = (Math.random() - 0.5) * box.height * 0.4;
      await page.mouse.click(
        box.x + box.width / 2 + offsetX,
        box.y + box.height / 2 + offsetY,
        { delay: randomDelay(30, 80) }
      );
    } else {
      await element.click({ delay: randomDelay(30, 80) });
    }
  }
}

/**
 * Type text with human-like speed and occasional variations
 */
export async function humanType(
  page: Page,
  selector: string,
  text: string,
  config: WarConfig['behavior']
): Promise<void> {
  const element = await page.$(selector);
  if (!element) return;

  // Click on the input first
  await humanClick(page, selector, config);
  await new Promise((resolve) => setTimeout(resolve, randomDelay(100, 200)));

  // Clear existing content
  await page.keyboard.press('Meta+a');
  await new Promise((resolve) => setTimeout(resolve, randomDelay(30, 60)));
  await page.keyboard.press('Backspace');
  await new Promise((resolve) => setTimeout(resolve, randomDelay(50, 100)));

  // Type each character with random delay
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.type(text[i], {
      delay: randomDelay(config.min_type_delay, config.max_type_delay),
    });

    // Occasional longer pause (like thinking while typing)
    if (Math.random() < 0.05) {
      await new Promise((resolve) => setTimeout(resolve, randomDelay(200, 500)));
    }
  }
}

/**
 * Smooth scroll to an element
 */
export async function humanScroll(page: Page, selector: string): Promise<void> {
  const element = await page.$(selector);
  if (!element) return;

  const box = await element.boundingBox();
  if (!box) return;

  const viewportSize = page.viewportSize();
  if (!viewportSize) return;

  // Calculate how far to scroll
  const targetY = box.y - viewportSize.height / 3;
  const currentScroll = await page.evaluate(() => window.scrollY);
  const distance = targetY - currentScroll;
  const steps = Math.max(10, Math.abs(Math.floor(distance / 50)));
  const stepSize = distance / steps;

  for (let i = 0; i < steps; i++) {
    await page.evaluate((scrollAmount) => {
      window.scrollBy(0, scrollAmount);
    }, stepSize + (Math.random() - 0.5) * 10);
    await new Promise((resolve) => setTimeout(resolve, randomDelay(15, 30)));
  }

  // Small overshoot and correction (like human scrolling)
  if (Math.random() < 0.3) {
    await page.evaluate(() => window.scrollBy(0, -20 + Math.random() * 40));
    await new Promise((resolve) => setTimeout(resolve, randomDelay(100, 200)));
  }
}

/**
 * Simulate random mouse movements (idle behavior)
 */
export async function randomMouseJitter(page: Page, duration: number = 2000): Promise<void> {
  const startTime = Date.now();
  const viewportSize = page.viewportSize();
  if (!viewportSize) return;

  while (Date.now() - startTime < duration) {
    const x = Math.random() * viewportSize.width;
    const y = Math.random() * viewportSize.height;
    await page.mouse.move(x, y, { steps: randomDelay(3, 8) });
    await new Promise((resolve) => setTimeout(resolve, randomDelay(200, 800)));
  }
}

/**
 * Automatically close promotional popups if they appear
 */
export async function closePopupIfPresent(page: Page): Promise<void> {
  try {
    // Pressing Escape works for 90% of React/Vue modals
    await page.keyboard.press('Escape');
    await new Promise((resolve) => setTimeout(resolve, 300));
    
    // Look for common close button selectors just in case
    const closeSelectors = [
      '[aria-label="Close"]',
      '[aria-label="Tutup"]',
      'button[class*="close" i]',
      'button[class*="Close" i]',
      'div[class*="close-icon" i]',
      '.modal-close'
    ];

    for (const sel of closeSelectors) {
      const elements = await page.$$(sel).catch(() => []);
      for (const el of elements) {
        if (await el.isVisible().catch(() => false)) {
          await el.click().catch(() => {});
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
  } catch (error) {
    // ignore error if no popup
  }
}

/**
 * Wait for page to be truly loaded (not just DOM ready)
 */
export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, randomDelay(500, 1000)));
  
  // Attempt to close any promotional popups that appear after load
  await closePopupIfPresent(page);
}

/**
 * Simulate tab focus/blur (some sites track this)
 */
export async function simulateTabActivity(page: Page): Promise<void> {
  // Simulate going to another tab briefly
  if (Math.random() < 0.1) {
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await new Promise((resolve) => setTimeout(resolve, randomDelay(1000, 3000)));
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }
}
