import type { Page } from 'playwright';
import type { WarConfig } from '../../config/loader.js';
import { SELECTORS } from '../utils/selectors.js';
import { takeScreenshot } from '../utils/screenshot.js';
import { humanDelay, randomMouseJitter } from '../stealth/human-like.js';

export type WaitingRoomStatus = 'not-in-queue' | 'in-queue' | 'exited' | 'error';

export interface WaitingRoomResult {
  status: WaitingRoomStatus;
  position?: string;
  estimatedTime?: string;
  error?: string;
}

/**
 * Navigate to event page and handle waiting room
 */
export async function waitingRoomFlow(
  page: Page,
  config: WarConfig,
  logger: any,
  workerId: string,
  onStatusUpdate?: (status: WaitingRoomResult) => void
): Promise<WaitingRoomResult> {
  const url = config.event.is_test && config.event.test_url ? config.event.test_url : config.event.url;
  logger.info({ phase: 'WAITING_ROOM' }, `Navigasi ke halaman event: ${url}`);

  try {
    // Navigate to event page
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await page.waitForTimeout(2000);

    // Check if we are on a promoter page (not tiket.com)
    if (!page.url().includes('tiket.com')) {
      logger.info({ phase: 'WAITING_ROOM' }, `Halaman promotor terdeteksi. Mencari link presale...`);
      // Find the presale link
      const presaleLink = await page.$('a:has-text("PRESALE"), a:has-text("Presale"), a:has-text("presale")');
      if (presaleLink) {
         let href = await presaleLink.getAttribute('href');
         if (href) {
            // Handle if they use an onclick to window.open or target="_blank"
            // We just navigate to the href directly in the same tab
            if (href.startsWith('/')) {
              const urlObj = new URL(page.url());
              href = `${urlObj.origin}${href}`;
            }
            logger.info({ phase: 'WAITING_ROOM' }, `Menuju ke link tiket: ${href}`);
            await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(2000);
         }
      } else {
         // Also try looking for any link to tiket.com
         const tiketLink = await page.$('a[href*="tiket.com"]');
         if (tiketLink) {
             const href = await tiketLink.getAttribute('href');
             if (href) {
                 logger.info({ phase: 'WAITING_ROOM' }, `Menuju ke link tiket: ${href}`);
                 await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 60000 });
                 await page.waitForTimeout(2000);
             }
         }
      }
    }

    await takeScreenshot(page, 'event-page-loaded', workerId);

    // Check if we're in a waiting room
    const inWaitingRoom = await detectWaitingRoom(page);

    if (!inWaitingRoom) {
      logger.info({ phase: 'WAITING_ROOM' }, '✅ Tidak ada waiting room! Langsung masuk.');
      return { status: 'exited' };
    }

    // We're in the waiting room
    logger.info({ phase: 'WAITING_ROOM' }, '⏳ Masuk waiting room. Menunggu giliran...');
    await takeScreenshot(page, 'waiting-room-entered', workerId);

    // Start monitoring loop
    const result = await monitorWaitingRoom(page, config, logger, workerId, onStatusUpdate);
    return result;

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ phase: 'WAITING_ROOM' }, `❌ Error di waiting room: ${errMsg}`);
    await takeScreenshot(page, 'waiting-room-error', workerId);
    return { status: 'error', error: errMsg };
  }
}

/**
 * Detect if we're currently in a waiting room/queue
 */
async function detectWaitingRoom(page: Page): Promise<boolean> {
  // Check URL patterns
  const url = page.url();
  if (url.includes('queue') || url.includes('waiting') || url.includes('waitingroom')) {
    return true;
  }

  // Check DOM elements
  const waitingRoomSelectors = [
    SELECTORS.waitingRoom.container,
    'text=waiting',
    'text=antrian',
    'text=queue',
    'text=Anda sedang dalam antrian',
    'text=Please wait',
    'text=Mohon tunggu',
    '[class*="queue"]',
    '[id*="queue"]',
    'iframe[src*="queue"]',
    'iframe[src*="waiting"]',
  ];

  for (const selector of waitingRoomSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const visible = await el.isVisible();
        if (visible) return true;
      }
    } catch {
      continue;
    }
  }

  // Check for queue-it or similar services (common in tiket.com)
  const hasQueueFrame = await page.$$('iframe').then(frames => 
    frames.some(async f => {
      const src = await f.getAttribute('src');
      return src && (src.includes('queue') || src.includes('waiting'));
    })
  );

  return hasQueueFrame;
}

/**
 * Monitor waiting room until we exit
 */
async function monitorWaitingRoom(
  page: Page,
  config: WarConfig,
  logger: any,
  workerId: string,
  onStatusUpdate?: (status: WaitingRoomResult) => void
): Promise<WaitingRoomResult> {
  const maxWaitTime = 60 * 60 * 1000; // 1 hour max wait
  const startTime = Date.now();
  let lastPosition = '';
  let screenshotCounter = 0;

  while (Date.now() - startTime < maxWaitTime) {
    // Check if we've exited the waiting room
    const stillWaiting = await detectWaitingRoom(page);
    
    if (!stillWaiting) {
      logger.info({ phase: 'WAITING_ROOM' }, '🎉 KELUAR DARI WAITING ROOM!');
      await takeScreenshot(page, 'waiting-room-exited', workerId);
      onStatusUpdate?.({ status: 'exited' });
      return { status: 'exited' };
    }

    // Also check if we've been redirected to ticket selection
    const ticketPage = await page.$(SELECTORS.waitingRoom.exitIndicator).catch(() => null);
    if (ticketPage) {
      logger.info({ phase: 'WAITING_ROOM' }, '🎉 Redirect ke halaman tiket!');
      await takeScreenshot(page, 'ticket-page-reached', workerId);
      onStatusUpdate?.({ status: 'exited' });
      return { status: 'exited' };
    }

    // Check URL changes (some waiting rooms redirect)
    const currentUrl = page.url();
    if (
      currentUrl.includes('ticket') || 
      currentUrl.includes('checkout') || 
      currentUrl.includes('order') ||
      currentUrl.includes('/to-do/') ||
      currentUrl.includes('/event/')
    ) {
      // Confirm we are actually on the event page by checking for buy buttons or titles
      const isEventPage = await page.evaluate((selectors) => {
        return !!document.querySelector(selectors.title) || 
               !!document.querySelector(selectors.buyBtn) ||
               !!document.querySelector(selectors.initBuyBtn);
      }, {
        title: SELECTORS.event.title.split(',')[0],
        buyBtn: SELECTORS.event.buyButton.split(',')[0],
        initBuyBtn: SELECTORS.ticket.initialBuyButton.split(',')[0]
      }).catch(() => false);

      if (isEventPage) {
        logger.info({ phase: 'WAITING_ROOM' }, `🎉 URL berubah ke halaman event/tiket: ${currentUrl}`);
        onStatusUpdate?.({ status: 'exited' });
        return { status: 'exited' };
      }
    }

    // Try to read queue position
    const position = await getQueuePosition(page);
    if (position && position !== lastPosition) {
      logger.info({ phase: 'WAITING_ROOM' }, `📊 Posisi antrian: ${position}`);
      lastPosition = position;
      onStatusUpdate?.({ status: 'in-queue', position });
    }

    // Take periodic screenshots (every 30 seconds)
    screenshotCounter++;
    if (screenshotCounter % 6 === 0) {
      await takeScreenshot(page, `waiting-room-${screenshotCounter}`, workerId);
    }

    // Simulate human behavior while waiting (subtle mouse movements)
    if (config.behavior.human_mouse && Math.random() < 0.3) {
      await randomMouseJitter(page, 1000);
    }

    // IMPORTANT: DO NOT refresh the page!
    // Just wait and check periodically
    await page.waitForTimeout(5000);
  }

  logger.warn({ phase: 'WAITING_ROOM' }, '⏰ Timeout waiting room (1 jam)');
  return { status: 'error', error: 'Timeout waiting room setelah 1 jam' };
}

/**
 * Try to extract queue position from the page
 */
async function getQueuePosition(page: Page): Promise<string | null> {
  try {
    // Try multiple patterns to find queue position
    const patterns = [
      SELECTORS.waitingRoom.position,
      '[class*="position"]',
      '[class*="number"]',
      'text=/\\d+\\s*(of|dari|\\/)\\s*\\d+/',
    ];

    for (const pattern of patterns) {
      try {
        const el = await page.$(pattern);
        if (el) {
          const text = await el.textContent();
          if (text && /\d/.test(text)) {
            return text.trim();
          }
        }
      } catch {
        continue;
      }
    }

    // Try to find position in page text
    const pageText = await page.evaluate(() => document.body.innerText);
    const positionMatch = pageText.match(/(?:position|posisi|nomor|antrian)[:\s]*(\d+)/i);
    if (positionMatch) {
      return positionMatch[1];
    }
  } catch {}

  return null;
}
