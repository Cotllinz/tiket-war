import type { Page } from 'playwright';
import type { WarConfig } from '../../config/loader.js';
import { SELECTORS } from '../utils/selectors.js';
import { humanClick, humanDelay, humanScroll, waitForPageReady } from '../stealth/human-like.js';
import { takeScreenshot, takeFullScreenshot } from '../utils/screenshot.js';

export interface PaymentResult {
  success: boolean;
  method?: string;
  paymentInfo?: string; // QR code path or VA number
  screenshotPath?: string;
  error?: string;
}

/**
 * Select payment method (QRIS or Mandiri) and confirm.
 * Handles tiket.com payment flow:
 *   1. Wait for payment page to load
 *   2. Select payment method (QRIS or Mandiri VA)
 *   3. Click confirm/pay button
 *   4. Capture payment info (QR code or VA number)
 */
export async function paymentFlow(
  page: Page,
  config: WarConfig,
  logger: any,
  workerId: string
): Promise<PaymentResult> {
  logger.info({ phase: 'PAYMENT' }, 'Memulai pemilihan pembayaran...');

  try {
    await waitForPageReady(page);
    await page.waitForTimeout(3000);
    
    const currentUrl = page.url();
    logger.info({ phase: 'PAYMENT' }, `Payment URL: ${currentUrl}`);
    await takeScreenshot(page, 'payment-page', workerId);

    // Step 1: Wait for payment options to appear
    logger.info({ phase: 'PAYMENT' }, 'Menunggu opsi pembayaran muncul...');
    await waitForPaymentOptions(page, logger);

    // Step 2: Try primary payment method
    let selectedMethod: string | null = null;
    
    selectedMethod = await trySelectPaymentMethod(page, config.payment.method, config, logger);
    
    // Step 3: If primary fails, try fallback
    if (!selectedMethod && config.payment.fallback_method) {
      logger.warn({ phase: 'PAYMENT' }, `Primary (${config.payment.method}) gagal, mencoba fallback (${config.payment.fallback_method})...`);
      selectedMethod = await trySelectPaymentMethod(page, config.payment.fallback_method, config, logger);
    }

    if (!selectedMethod) {
      // Take a screenshot to see what's on the page
      await takeScreenshot(page, 'payment-method-not-found', workerId);
      throw new Error(`Tidak bisa memilih metode pembayaran (${config.payment.method} / ${config.payment.fallback_method})`);
    }

    logger.info({ phase: 'PAYMENT' }, `✅ Metode pembayaran dipilih: ${selectedMethod}`);
    await humanDelay(config.behavior);
    await takeScreenshot(page, 'payment-method-selected', workerId);

    // Step 4: Click pay/confirm button
    logger.info({ phase: 'PAYMENT' }, 'Klik tombol Bayar...');
    await clickPayButton(page, config, logger);

    // Step 5: Wait for payment info to appear
    logger.info({ phase: 'PAYMENT' }, 'Menunggu info pembayaran muncul...');
    await page.waitForTimeout(5000);
    await waitForPageReady(page);

    // Step 6: Capture payment information
    const screenshotPath = await takeFullScreenshot(page, 'payment-info-final', workerId);
    let paymentInfo = '';

    if (selectedMethod === 'qris') {
      paymentInfo = await captureQRISInfo(page, screenshotPath, logger);
    } else if (selectedMethod === 'mandiri') {
      paymentInfo = await captureMandiriInfo(page, logger);
    }

    // Try to get payment deadline
    try {
      const deadlineSelectors = [
        SELECTORS.payment.deadline,
        '[class*="countdown"]',
        '[class*="timer"]',
        'text=/\\d{2}:\\d{2}:\\d{2}/',
      ];
      for (const sel of deadlineSelectors) {
        const deadlineEl = await page.$(sel);
        if (deadlineEl && await deadlineEl.isVisible()) {
          const deadline = await deadlineEl.textContent();
          if (deadline) {
            logger.info({ phase: 'PAYMENT' }, `⏰ Batas pembayaran: ${deadline.trim()}`);
            break;
          }
        }
      }
    } catch {}

    logger.info({ phase: 'PAYMENT' }, '🎉🎉🎉 SAMPAI DI HALAMAN PEMBAYARAN! SEGERA BAYAR! 🎉🎉🎉');

    return {
      success: true,
      method: selectedMethod,
      paymentInfo,
      screenshotPath,
    };

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ phase: 'PAYMENT' }, `❌ Payment gagal: ${errMsg}`);
    await takeScreenshot(page, 'payment-error', workerId);
    return { success: false, error: errMsg };
  }
}

/**
 * Wait for payment options to appear on page
 */
async function waitForPaymentOptions(page: Page, logger: any): Promise<void> {
  const indicators = [
    SELECTORS.payment.container,
    'text="QRIS"',
    'text="Mandiri"',
    'text="BCA"',
    'text="Transfer"',
    'text="Virtual Account"',
    'text="Metode Pembayaran"',
    'text="Payment Method"',
    '[class*="payment"]',
    'input[type="radio"]',
  ];

  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (const selector of indicators) {
      try {
        const sels = selector.split(', ');
        for (const sel of sels) {
          const el = await page.$(sel);
          if (el && await el.isVisible()) {
            logger.info({ phase: 'PAYMENT' }, `Opsi pembayaran terdeteksi (${sel})`);
            return;
          }
        }
      } catch {}
    }
    
    logger.info({ phase: 'PAYMENT' }, `Menunggu opsi pembayaran... (percobaan ${attempt + 1}/${maxAttempts})`);
    await page.waitForTimeout(2000);
  }
  
  logger.warn({ phase: 'PAYMENT' }, 'Opsi pembayaran tidak terdeteksi, tetap lanjut...');
}

/**
 * Try to select a specific payment method
 */
async function trySelectPaymentMethod(
  page: Page,
  method: string,
  config: WarConfig,
  logger: any
): Promise<string | null> {
  const methodName = method === 'qris' ? 'QRIS' : 'Mandiri';
  logger.info({ phase: 'PAYMENT' }, `Mencari metode: ${methodName}...`);

  // Method-specific selectors
  const methodSelectors: Record<string, string> = {
    qris: SELECTORS.payment.qris,
    mandiri: SELECTORS.payment.mandiri,
  };

  const selectorString = methodSelectors[method];
  if (!selectorString) {
    logger.error({ phase: 'PAYMENT' }, `Unknown payment method: ${method}`);
    return null;
  }

  // First, scroll down to find payment methods section
  try {
    const containers = SELECTORS.payment.container.split(', ');
    for (const container of containers) {
      const el = await page.$(container);
      if (el && await el.isVisible()) {
        await el.scrollIntoViewIfNeeded();
        break;
      }
    }
    await humanDelay(config.behavior);
  } catch {}

  // Try each selector
  const selectors = selectorString.split(', ');
  for (const selector of selectors) {
    try {
      const elements = await page.$$(selector);
      for (const el of elements) {
        const visible = await el.isVisible().catch(() => false);
        if (visible) {
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await el.click();
          await humanDelay(config.behavior);
          logger.info({ phase: 'PAYMENT' }, `  ✅ Payment method clicked: ${selector}`);
          return method;
        }
      }
    } catch {
      continue;
    }
  }

  // Fallback: text-based search
  try {
    const textElements = await page.$$(`text="${methodName}"`);
    for (const el of textElements) {
      const visible = await el.isVisible().catch(() => false);
      if (visible) {
        // Find the clickable parent
        const clickTarget = await page.evaluateHandle((element) => {
          let current = element as HTMLElement;
          for (let i = 0; i < 5 && current.parentElement; i++) {
            current = current.parentElement;
            if (current.tagName === 'BUTTON' || current.tagName === 'LABEL' || 
                current.tagName === 'A' || current.getAttribute('role') === 'button' ||
                current.classList.contains('radio') || current.classList.contains('payment') ||
                current.querySelector('input[type="radio"]')) {
              return current;
            }
          }
          return element;
        }, el);

        await (clickTarget as any).click();
        await humanDelay(config.behavior);
        logger.info({ phase: 'PAYMENT' }, `  ✅ Payment method clicked via text: ${methodName}`);
        return method;
      }
    }
  } catch {}

  // Fallback: radio button approach
  try {
    const radios = await page.$$('input[type="radio"]');
    for (const radio of radios) {
      const parent = await radio.evaluateHandle((el: Element) => el.closest('label, div, li') || el);
      const text = await page.evaluate((el: Element) => el.textContent || '', parent);
      if (text.toLowerCase().includes(methodName.toLowerCase())) {
        await radio.check().catch(async () => {
          await (parent as any).click();
        });
        await humanDelay(config.behavior);
        logger.info({ phase: 'PAYMENT' }, `  ✅ Payment method via radio: ${methodName}`);
        return method;
      }
    }
  } catch {}

  logger.warn({ phase: 'PAYMENT' }, `  ❌ Metode ${methodName} tidak ditemukan`);
  return null;
}

/**
 * Click the pay/confirm button
 */
async function clickPayButton(page: Page, config: WarConfig, logger: any): Promise<void> {
  const paySelectors = [
    ...SELECTORS.payment.payButton.split(', '),
    'button:has-text("Konfirmasi Pembayaran")',
    'button:has-text("Proses Pembayaran")',
    'button:has-text("Lanjutkan")',
    'button:has-text("Lanjutkan Pembayaran")',
    'button:has-text("Submit")',
    'button:has-text("Selesaikan")',
    'button:has-text("Complete")',
    'button:has-text("Proses")',
    'button:has-text("Order")',
    'button[type="submit"]',
    'button[class*="submit" i]',
    'button[class*="pay" i]',
    'button[class*="confirm" i]',
  ];

  for (const selector of paySelectors) {
    try {
      const elements = await page.$$(selector);
      for (const el of elements) {
        const visible = await el.isVisible().catch(() => false);
        const disabled = await el.isDisabled().catch(() => false);
        if (visible && !disabled) {
          const text = (await el.textContent() || '').trim();
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await el.click();
          logger.info({ phase: 'PAYMENT' }, `  Tombol bayar diklik: "${text.substring(0, 40)}"`);
          return;
        }
      }
    } catch {
      continue;
    }
  }

  logger.warn({ phase: 'PAYMENT' }, '  Tombol bayar tidak ditemukan, mungkin sudah otomatis proses');
}

/**
 * Capture QRIS payment info
 */
async function captureQRISInfo(page: Page, screenshotPath: string, logger: any): Promise<string> {
  logger.info({ phase: 'PAYMENT' }, '📱 Mencari QR Code QRIS...');

  const qrSelectors = [
    SELECTORS.payment.qrCode,
    'img[alt*="QR" i]',
    'img[src*="qr" i]',
    'canvas',
    '[class*="qr" i]',
    'img[class*="qr" i]',
  ];

  for (const selector of qrSelectors) {
    try {
      const sels = selector.split(', ');
      for (const sel of sels) {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          try {
            await el.screenshot({ path: screenshotPath.replace('.png', '_qr.png') });
            logger.info({ phase: 'PAYMENT' }, '📱 QR Code berhasil di-screenshot!');
          } catch {}
          return 'QRIS QR Code — lihat screenshot';
        }
      }
    } catch {}
  }

  return 'QRIS — lihat screenshot halaman';
}

/**
 * Capture Mandiri VA info
 */
async function captureMandiriInfo(page: Page, logger: any): Promise<string> {
  logger.info({ phase: 'PAYMENT' }, '🏦 Mencari VA Number Mandiri...');

  const vaSelectors = [
    SELECTORS.payment.vaNumber,
    '[class*="va-number"]',
    '[class*="account-number"]',
    '[class*="virtual-account"]',
    'text=/\\d{3,}\\s*\\d{3,}/',
  ];

  for (const selector of vaSelectors) {
    try {
      const sels = selector.split(', ');
      for (const sel of sels) {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          const text = await el.textContent();
          if (text) {
            logger.info({ phase: 'PAYMENT' }, `🏦 VA Number: ${text.trim()}`);
            return text.trim();
          }
        }
      }
    } catch {}
  }

  return 'Mandiri VA — lihat screenshot';
}
