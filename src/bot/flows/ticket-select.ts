import type { Page } from 'playwright';
import type { WarConfig, Account } from '../../config/loader.js';
import { SELECTORS } from '../utils/selectors.js';
import { humanClick, humanDelay, humanScroll, waitForPageReady } from '../stealth/human-like.js';
import { takeScreenshot } from '../utils/screenshot.js';
import { retry } from '../utils/retry.js';

export interface TicketSelectResult {
  success: boolean;
  category?: string;
  quantity?: number;
  error?: string;
}

/**
 * Select ticket category and quantity.
 * Handles tiket.com presale flow:
 *   1. Click "Beli tiket sekarang"
 *   2. Scroll to category sections (CAT 2, CAT 3, etc.)
 *   3. Find a non-sold-out category
 *   4. Click "Verifikasi kode" on that category
 *   5. Enter presale/membership code
 *   6. After verification, set quantity & proceed
 */
export async function ticketSelectFlow(
  page: Page,
  config: WarConfig,
  account: Account,
  logger: any,
  workerId: string
): Promise<TicketSelectResult> {
  logger.info({ phase: 'TICKET_SELECT' }, 'Memulai pemilihan tiket...');

  try {
    await waitForPageReady(page);
    await humanDelay(config.behavior);

    // Take screenshot of current page state
    await takeScreenshot(page, 'ticket-page-initial', workerId);
    
    // Log current URL for debugging
    logger.info({ phase: 'TICKET_SELECT' }, `Current URL: ${page.url()}`);

    // Step 1: Click "Beli tiket sekarang" button if visible
    await clickInitialBuyButton(page, config, logger);

    // Step 2: Wait for categories to load
    logger.info({ phase: 'TICKET_SELECT' }, 'Menunggu daftar kategori tiket muncul...');
    await page.waitForTimeout(3000);
    await takeScreenshot(page, 'ticket-categories-loaded', workerId);

    // Step 3: Scroll down to see all categories
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(1000);

    // Step 4: Try each category in priority order
    let selectedCategory: string | null = null;

    for (const category of config.ticket.category_priority) {
      logger.info({ phase: 'TICKET_SELECT' }, `Mencoba kategori: ${category}...`);

      const result = await trySelectAndVerifyCategory(page, category, account, config, logger, workerId);
      if (result) {
        selectedCategory = category;
        logger.info({ phase: 'TICKET_SELECT' }, `✅ Kategori ${category} berhasil dipilih & diverifikasi!`);
        break;
      } else {
        logger.warn({ phase: 'TICKET_SELECT' }, `❌ Kategori ${category} gagal/habis, lanjut ke berikutnya...`);
      }
    }

    if (!selectedCategory) {
      throw new Error('Semua kategori tiket habis/tidak tersedia');
    }

    // Step 5: Set quantity (if quantity selector exists)
    logger.info({ phase: 'TICKET_SELECT' }, `Mengatur jumlah tiket: ${config.ticket.quantity}`);
    await setQuantity(page, config.ticket.quantity, config, logger);
    await humanDelay(config.behavior);

    // Step 6: Click the main buy/proceed button
    logger.info({ phase: 'TICKET_SELECT' }, 'Klik tombol Beli/Lanjut...');
    await clickBuyButton(page, config, logger);

    await takeScreenshot(page, 'ticket-selected', workerId);

    // Step 7: Wait for page transition (checkout page)
    await page.waitForTimeout(3000);
    
    // Check if we moved to a new page
    const currentUrl = page.url();
    logger.info({ phase: 'TICKET_SELECT' }, `URL setelah klik beli: ${currentUrl}`);
    
    return {
      success: true,
      category: selectedCategory,
      quantity: config.ticket.quantity,
    };

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ phase: 'TICKET_SELECT' }, `❌ Gagal memilih tiket: ${errMsg}`);
    await takeScreenshot(page, 'ticket-select-error', workerId);
    return { success: false, error: errMsg };
  }
}

/**
 * Click the initial "Beli tiket sekarang" button on the event page
 */
async function clickInitialBuyButton(page: Page, config: WarConfig, logger: any): Promise<void> {
  const buyNowSelectors = [
    'button:has-text("Beli tiket sekarang")',
    'a:has-text("Beli tiket sekarang")',
    'button:has-text("Beli Tiket")',
    'a:has-text("Beli Tiket")',
    SELECTORS.event.buyButton,
  ];

  for (const selector of buyNowSelectors) {
    try {
      const sels = selector.split(', ');
      for (const sel of sels) {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          logger.info({ phase: 'TICKET_SELECT' }, `Mengklik tombol: ${sel}`);
          await el.scrollIntoViewIfNeeded();
          await el.click();
          await page.waitForTimeout(2000);
          return;
        }
      }
    } catch {}
  }
  logger.info({ phase: 'TICKET_SELECT' }, 'Tombol Beli tiket tidak ditemukan, mungkin sudah di halaman kategori.');
}

/**
 * Try to select and verify a category (presale flow).
 * Returns true if successfully selected and verified.
 */
async function trySelectAndVerifyCategory(
  page: Page,
  categoryName: string,
  account: Account,
  config: WarConfig,
  logger: any,
  workerId: string
): Promise<boolean> {
  try {
    // Find category heading/section by text
    // tiket.com uses headings like "CAT 2", "CAT 3", etc.
    const categoryHeadings = await page.$$(`text="${categoryName}"`);
    
    if (categoryHeadings.length === 0) {
      logger.info({ phase: 'TICKET_SELECT' }, `Heading "${categoryName}" tidak ditemukan di halaman`);
      return false;
    }

    for (const heading of categoryHeadings) {
      const isVisible = await heading.isVisible().catch(() => false);
      if (!isVisible) continue;

      // Scroll to this category
      await heading.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);

      // Strategy: Find ALL "Verifikasi kode" buttons on the page,
      // then pick the one closest (vertically) to this category heading.
      const headingBox = await heading.boundingBox();
      if (!headingBox) continue;
      
      logger.info({ phase: 'TICKET_SELECT' }, `${categoryName} ditemukan di Y=${Math.round(headingBox.y)}`);

      // Find all verify buttons
      const allVerifyBtns = await page.$$('button:has-text("Verifikasi kode")');
      
      if (allVerifyBtns.length === 0) {
        logger.info({ phase: 'TICKET_SELECT' }, `${categoryName} → Tidak ada tombol Verifikasi kode di halaman`);
        // Try direct click for non-presale categories
        await heading.click().catch(() => {});
        await page.waitForTimeout(1000);
        return true;
      }

      // Find the verify button that is BELOW and closest to this heading
      let closestBtn: any = null;
      let closestDistance = Infinity;
      
      for (const btn of allVerifyBtns) {
        const btnBox = await btn.boundingBox().catch(() => null);
        if (!btnBox) continue;
        
        // Button should be below (or very near) the heading
        const distance = btnBox.y - headingBox.y;
        // Accept buttons that are 0-300px below the heading
        if (distance >= -20 && distance < 300 && distance < closestDistance) {
          closestDistance = distance;
          closestBtn = btn;
        }
      }

      if (!closestBtn) {
        logger.info({ phase: 'TICKET_SELECT' }, `${categoryName} → Tidak ada Verifikasi kode button dekat heading ini`);
        continue;
      }

      // Check if the closest button is enabled
      const btnDisabled = await closestBtn.isDisabled().catch(() => false);
      const btnVisible = await closestBtn.isVisible().catch(() => false);
      
      // Also check via CSS: disabled buttons often have opacity or specific classes
      const isGreyedOut = await page.evaluate((el: Element) => {
        const style = window.getComputedStyle(el);
        const opacity = parseFloat(style.opacity);
        const isDisabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
        const hasDisabledClass = el.className.includes('disabled') || el.className.includes('grey') || el.className.includes('gray');
        const pointerEvents = style.pointerEvents;
        return isDisabled || hasDisabledClass || opacity < 0.5 || pointerEvents === 'none';
      }, closestBtn).catch(() => false);

      if (btnDisabled || !btnVisible || isGreyedOut) {
        logger.info({ phase: 'TICKET_SELECT' }, `${categoryName} → Verifikasi kode button disabled/greyed out (distance=${Math.round(closestDistance)}px), skip`);
        continue;
      }

      // Button is active! Click it
      logger.info({ phase: 'TICKET_SELECT' }, `${categoryName} → Tombol Verifikasi kode AKTIF! Mengklik... (distance=${Math.round(closestDistance)}px)`);
      await closestBtn.scrollIntoViewIfNeeded().catch(() => {});
      await closestBtn.click();
      await page.waitForTimeout(1500);
      await takeScreenshot(page, `verify-code-clicked-${categoryName.replace(/\s/g, '')}`, workerId);

      // Now enter the presale code
      if (account.presale_code) {
        const codeEntered = await enterPresaleCode(page, account.presale_code, config, logger);
        if (codeEntered) {
          // Wait for verification response
          await page.waitForTimeout(3000);
          await takeScreenshot(page, `presale-verified-${categoryName.replace(/\s/g, '')}`, workerId);
          
          // Check if verification was successful
          const pageText = await page.evaluate(() => document.body.innerText);
          if (pageText.includes('kode tidak valid') || pageText.includes('invalid') || pageText.includes('gagal')) {
            logger.warn({ phase: 'TICKET_SELECT' }, `${categoryName} → Kode presale ditolak!`);
            continue;
          }
          
          logger.info({ phase: 'TICKET_SELECT' }, `${categoryName} → Presale code diterima!`);
          return true;
        }
      } else {
        logger.warn({ phase: 'TICKET_SELECT' }, `${categoryName} → Butuh presale code tapi tidak diset!`);
        return false;
      }
    }

    return false;
  } catch (error) {
    logger.warn({ phase: 'TICKET_SELECT' }, `Error saat mencoba ${categoryName}: ${error}`);
    return false;
  }
}

/**
 * Enter presale/membership code into the input field
 */
async function enterPresaleCode(
  page: Page,
  code: string,
  config: WarConfig,
  logger: any
): Promise<boolean> {
  logger.info({ phase: 'TICKET_SELECT' }, `Mencari input field untuk kode presale...`);

  // Try multiple input selectors
  const inputSelectors = [
    'input[placeholder*="kode" i]',
    'input[placeholder*="code" i]',
    'input[placeholder*="membership" i]',
    'input[placeholder*="promo" i]',
    'input[name*="code" i]',
    'input[name*="promo" i]',
    'input[name*="presale" i]',
    'input[type="text"]',  // fallback: any visible text input that just appeared
  ];

  for (const selector of inputSelectors) {
    try {
      const inputs = await page.$$(selector);
      for (const input of inputs) {
        const visible = await input.isVisible().catch(() => false);
        if (!visible) continue;

        logger.info({ phase: 'TICKET_SELECT' }, `Input field ditemukan (${selector}), mengisi kode: ${code}`);
        await input.scrollIntoViewIfNeeded().catch(() => {});
        await input.click();
        await input.fill(code);
        await humanDelay(config.behavior);

        // Find and click the submit/verify button near this input
        const submitted = await clickNearbySubmitButton(page, input, config, logger);
        return submitted;
      }
    } catch {
      continue;
    }
  }

  logger.warn({ phase: 'TICKET_SELECT' }, 'Tidak menemukan input field untuk kode presale');
  return false;
}

/**
 * Click the submit/verify button near a presale input
 */
async function clickNearbySubmitButton(
  page: Page,
  inputElement: any,
  config: WarConfig,
  logger: any
): Promise<boolean> {
  const submitSelectors = [
    'button:has-text("Verifikasi")',
    'button:has-text("Submit")',
    'button:has-text("Apply")',
    'button:has-text("Gunakan")',
    'button:has-text("Terapkan")',
    'button:has-text("Cek")',
    'button[type="submit"]',
  ];

  for (const selector of submitSelectors) {
    try {
      const btns = await page.$$(selector);
      for (const btn of btns) {
        const visible = await btn.isVisible().catch(() => false);
        const disabled = await btn.isDisabled().catch(() => false);
        if (visible && !disabled) {
          logger.info({ phase: 'TICKET_SELECT' }, `Klik tombol submit presale: ${selector}`);
          await btn.click();
          await page.waitForTimeout(2000);
          return true;
        }
      }
    } catch {}
  }

  // If no explicit submit button found, try pressing Enter
  logger.info({ phase: 'TICKET_SELECT' }, 'Tidak ada tombol submit, mencoba Enter...');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
  return true;
}

/**
 * Set the ticket quantity
 */
async function setQuantity(page: Page, quantity: number, config: WarConfig, logger: any): Promise<void> {
  // Method 1: Try direct input
  try {
    const quantityInput = await page.$(SELECTORS.ticket.quantityInput);
    if (quantityInput && await quantityInput.isVisible()) {
      await quantityInput.fill(String(quantity));
      logger.info({ phase: 'TICKET_SELECT' }, `  Quantity diset via input: ${quantity}`);
      return;
    }
  } catch {}

  // Method 2: Try plus button (click N-1 times since default is 1)
  try {
    const plusBtnSelectors = SELECTORS.ticket.quantityPlus.split(', ');
    for (const sel of plusBtnSelectors) {
      const plusBtn = await page.$(sel);
      if (plusBtn && await plusBtn.isVisible()) {
        const clicksNeeded = quantity - 1;
        for (let i = 0; i < clicksNeeded; i++) {
          await plusBtn.click();
          await page.waitForTimeout(300);
        }
        logger.info({ phase: 'TICKET_SELECT' }, `  Quantity diset via plus button: ${quantity}`);
        return;
      }
    }
  } catch {}

  // Method 3: Try dropdown/select
  try {
    const select = await page.$('select[name*="quantity" i], select[name*="qty" i]');
    if (select) {
      await select.selectOption(String(quantity));
      logger.info({ phase: 'TICKET_SELECT' }, `  Quantity diset via dropdown: ${quantity}`);
      return;
    }
  } catch {}

  logger.warn({ phase: 'TICKET_SELECT' }, `  Quantity selector tidak ditemukan, default mungkin 1`);
}

/**
 * Click the buy/add to cart/proceed button
 */
async function clickBuyButton(page: Page, config: WarConfig, logger: any): Promise<void> {
  // Extended list of selectors for the buy button
  const buySelectors = [
    // Specific tiket.com patterns
    'button:has-text("Beli tiket")',
    'button:has-text("Beli Tiket")',
    'button:has-text("Pesan Sekarang")',
    'button:has-text("Pesan sekarang")',
    // Generic
    ...SELECTORS.ticket.addToCart.split(', '),
    'button:has-text("Beli")',
    'button:has-text("Tambah")',
    'button:has-text("Pesan")',
    'button:has-text("Lanjut")',
    'button:has-text("Lanjutkan")',
    'button:has-text("Pilih Tiket")',
    'button:has-text("Checkout")',
    'button:has-text("Proceed")',
    // CSS class-based
    'button[class*="buy" i]',
    'button[class*="beli" i]',
    'button[class*="submit" i]',
    'button[class*="checkout" i]',
    'button[class*="primary" i]',
    'a[class*="buy" i]',
    // Data-testid based
    '[data-testid*="buy"]',
    '[data-testid*="checkout"]',
    '[data-testid*="submit"]',
  ];

  // Wait a bit for any UI updates after verification
  await page.waitForTimeout(1000);

  for (const selector of buySelectors) {
    try {
      const elements = await page.$$(selector);
      for (const el of elements) {
        const visible = await el.isVisible().catch(() => false);
        const disabled = await el.isDisabled().catch(() => false);
        if (visible && !disabled) {
          const text = await el.textContent() || '';
          // Skip if this is the "Verifikasi kode" button
          if (text.toLowerCase().includes('verifikasi')) continue;
          // Skip if this is clearly a category header
          if (text.trim().startsWith('CAT')) continue;
          
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await el.click();
          logger.info({ phase: 'TICKET_SELECT' }, `  Tombol beli diklik: "${text.trim().substring(0, 40)}" (${selector})`);
          
          // Wait for navigation/modal
          await page.waitForTimeout(3000);
          return;
        }
      }
    } catch {
      continue;
    }
  }

  // Last resort: try to find any prominent button at the bottom
  try {
    const allButtons = await page.$$('button');
    for (const btn of allButtons) {
      const visible = await btn.isVisible().catch(() => false);
      const disabled = await btn.isDisabled().catch(() => false);
      if (!visible || disabled) continue;
      
      const text = (await btn.textContent() || '').toLowerCase().trim();
      if (text.includes('beli') || text.includes('pesan') || text.includes('lanjut') || text.includes('checkout')) {
        if (text.includes('verifikasi')) continue;
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click();
        logger.info({ phase: 'TICKET_SELECT' }, `  Tombol beli (fallback) diklik: "${text.substring(0, 40)}"`);
        await page.waitForTimeout(3000);
        return;
      }
    }
  } catch {}

  // If still no button, maybe the page auto-transitions after verification
  logger.warn({ phase: 'TICKET_SELECT' }, '  Tombol Beli/Pesan tidak ditemukan. Cek apakah sudah auto-redirect...');
  // Don't throw — let the flow continue and the checkout step will handle it
}

/**
 * Select the preferred show date
 */
async function selectShowDate(page: Page, config: WarConfig, logger: any): Promise<void> {
  try {
    const dateSelector = SELECTORS.event.dateOption(config.ticket.preferred_date!);
    const dateEl = await page.$(dateSelector);
    if (dateEl) {
      await humanClick(page, dateSelector, config.behavior);
      logger.info({ phase: 'TICKET_SELECT' }, `Tanggal ${config.ticket.preferred_date} dipilih`);
      await humanDelay(config.behavior);
    }
  } catch {
    logger.info({ phase: 'TICKET_SELECT' }, 'Tidak ada pemilihan tanggal, lanjut...');
  }
}
