import type { Page } from 'playwright';
import type { WarConfig, Buyer } from '../../config/loader.js';
import { SELECTORS } from '../utils/selectors.js';
import { humanClick, humanType, humanDelay, humanScroll, waitForPageReady } from '../stealth/human-like.js';
import { takeScreenshot } from '../utils/screenshot.js';

export interface CheckoutResult {
  success: boolean;
  error?: string;
}

/**
 * Fill checkout form with buyer data and proceed to payment.
 * Handles tiket.com checkout flow:
 *   1. Wait for checkout/order page to fully load
 *   2. Fill buyer information (name, NIK, email, phone) for each ticket
 *   3. Accept terms & conditions
 *   4. Click continue to payment
 */
export async function checkoutFlow(
  page: Page,
  config: WarConfig,
  logger: any,
  workerId: string
): Promise<CheckoutResult> {
  logger.info({ phase: 'CHECKOUT' }, 'Memulai proses checkout...');

  try {
    await waitForPageReady(page);
    await page.waitForTimeout(3000);
    
    const currentUrl = page.url();
    logger.info({ phase: 'CHECKOUT' }, `Checkout URL: ${currentUrl}`);
    await takeScreenshot(page, 'checkout-page', workerId);

    // Step 1: Wait for form elements to appear
    logger.info({ phase: 'CHECKOUT' }, 'Menunggu form checkout muncul...');
    await waitForCheckoutForm(page, logger);

    // Step 2: Fill buyer information for each ticket
    const rawBuyers = config.buyers.slice(0, config.ticket.quantity);
    
    for (let i = 0; i < rawBuyers.length; i++) {
      const rawBuyer = rawBuyers[i];
      const buyer: Buyer = {
        full_name: getBuyerValue('full_name', rawBuyer.full_name),
        identity_number: getBuyerValue('identity_number', rawBuyer.identity_number),
        email: getBuyerValue('email', rawBuyer.email),
        phone: getBuyerValue('phone', rawBuyer.phone),
        identity_type: rawBuyer.identity_type
      };

      logger.info({ phase: 'CHECKOUT' }, `Mengisi data pemesan ${i + 1}/${rawBuyers.length}: ${buyer.full_name} (${buyer.identity_number})`);

      // Try to find attendee-specific form section
      const attendeeFormSelector = SELECTORS.checkout.attendeeForm(i);
      const hasMultipleForms = await page.$(attendeeFormSelector).catch(() => null);

      if (hasMultipleForms && i > 0) {
        await fillBuyerForm(page, buyer, config, logger, attendeeFormSelector);
      } else {
        await fillBuyerForm(page, buyer, config, logger);
      }

      await humanDelay(config.behavior);
    }

    // Step 3: Check terms & conditions
    logger.info({ phase: 'CHECKOUT' }, 'Menyetujui Terms & Conditions...');
    await checkTermsAndConditions(page, config, logger);

    // Step 4: Take screenshot of filled form
    await takeScreenshot(page, 'checkout-filled', workerId);

    // Step 5: Click continue/submit button
    logger.info({ phase: 'CHECKOUT' }, 'Klik tombol Lanjut ke Pembayaran...');
    await clickContinueButton(page, config, logger);

    // Step 6: Wait for page transition to payment
    logger.info({ phase: 'CHECKOUT' }, 'Menunggu redirect ke halaman pembayaran...');
    await page.waitForTimeout(5000);
    await waitForPageReady(page);

    const finalUrl = page.url();
    logger.info({ phase: 'CHECKOUT' }, `✅ Checkout berhasil! URL: ${finalUrl}`);
    await takeScreenshot(page, 'checkout-submitted', workerId);
    
    return { success: true };

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ phase: 'CHECKOUT' }, `❌ Checkout gagal: ${errMsg}`);
    await takeScreenshot(page, 'checkout-error', workerId);
    return { success: false, error: errMsg };
  }
}

/**
 * Wait for checkout form to appear on the page
 */
async function waitForCheckoutForm(page: Page, logger: any): Promise<void> {
  const formIndicators = [
    'input[type="text"]',
    'input[type="email"]',
    'input[type="tel"]',
    'input[name*="name" i]',
    'input[placeholder*="nama" i]',
    'form',
    SELECTORS.checkout.formContainer,
  ];

  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (const selector of formIndicators) {
      try {
        const sels = selector.split(', ');
        for (const sel of sels) {
          const el = await page.$(sel);
          if (el && await el.isVisible()) {
            logger.info({ phase: 'CHECKOUT' }, `Form terdeteksi (${sel})`);
            return;
          }
        }
      } catch {}
    }
    
    logger.info({ phase: 'CHECKOUT' }, `Menunggu form muncul... (percobaan ${attempt + 1}/${maxAttempts})`);
    await page.waitForTimeout(2000);
  }
  
  logger.warn({ phase: 'CHECKOUT' }, 'Form tidak terdeteksi setelah menunggu, tetap lanjut...');
}

/**
 * Fill a single buyer's form fields
 */
async function fillBuyerForm(
  page: Page,
  buyer: WarConfig['buyers'][0],
  config: WarConfig,
  logger: any,
  scopeSelector?: string
): Promise<void> {
  const scope = scopeSelector || '';
  const scoped = (selector: string) => scope ? `${scope} ${selector}` : selector;

  // Fill name
  await tryFillField(page, [
    scoped(SELECTORS.checkout.nameInput),
    scoped('input[placeholder*="nama" i]'),
    scoped('input[placeholder*="name" i]'),
    scoped('input[name*="name" i]'),
    scoped('input[id*="name" i]'),
    scoped('input[autocomplete="name"]'),
  ], buyer.full_name, config, logger, 'Nama');

  // Fill identity number (NIK/KTP)
  await tryFillField(page, [
    scoped(SELECTORS.checkout.identityInput),
    scoped('input[placeholder*="NIK" i]'),
    scoped('input[placeholder*="KTP" i]'),
    scoped('input[placeholder*="identitas" i]'),
    scoped('input[placeholder*="identity" i]'),
    scoped('input[name*="identity" i]'),
    scoped('input[name*="nik" i]'),
    scoped('input[id*="identity" i]'),
    scoped('input[id*="nik" i]'),
  ], buyer.identity_number, config, logger, 'NIK');

  // Fill email
  await tryFillField(page, [
    scoped(SELECTORS.checkout.emailInput),
    scoped('input[type="email"]'),
    scoped('input[placeholder*="email" i]'),
    scoped('input[name*="email" i]'),
    scoped('input[autocomplete="email"]'),
  ], buyer.email, config, logger, 'Email');

  // Fill phone
  await tryFillField(page, [
    scoped(SELECTORS.checkout.phoneInput),
    scoped('input[type="tel"]'),
    scoped('input[placeholder*="telepon" i]'),
    scoped('input[placeholder*="phone" i]'),
    scoped('input[placeholder*="HP" i]'),
    scoped('input[placeholder*="handphone" i]'),
    scoped('input[placeholder*="nomor" i]'),
    scoped('input[name*="phone" i]'),
    scoped('input[name*="tel" i]'),
    scoped('input[autocomplete="tel"]'),
  ], buyer.phone, config, logger, 'Phone');

  // Select Title/Salutation (Tuan/Nyonya/Nona) if it exists
  try {
    const titleSelectors = [
      scoped('select[name*="title" i]'),
      scoped('select[name*="salutation" i]'),
      scoped('select[name*="panggilan" i]'),
      scoped('select[name*="gender" i]'),
    ];
    for (const sel of titleSelectors) {
      const titleSelect = await page.$(sel);
      if (titleSelect && await titleSelect.isVisible()) {
        const options = await titleSelect.$$eval('option', (opts) => opts.map(o => o.value));
        const preferred = options.find(o => /mr/i.test(o) || /tuan/i.test(o)) || options[1] || options[0];
        if (preferred) {
          await titleSelect.selectOption(preferred);
          logger.info({ phase: 'CHECKOUT' }, `  Salutation selected: ${preferred} ✅`);
        }
        break;
      }
    }
  } catch {}

  // Select Nationality if it exists
  try {
    const nationalitySelectors = [
      scoped('select[name*="nationality" i]'),
      scoped('select[name*="negara" i]'),
      scoped('select[name*="country" i]'),
    ];
    for (const sel of nationalitySelectors) {
      const natSelect = await page.$(sel);
      if (natSelect && await natSelect.isVisible()) {
        const options = await natSelect.$$eval('option', (opts) => opts.map(o => ({ value: o.value, text: o.textContent })));
        const idOption = options.find(o => /indonesia/i.test(o.text || '') || /ID/i.test(o.value || ''));
        const preferred = idOption ? idOption.value : (options[1]?.value || options[0]?.value);
        if (preferred) {
          await natSelect.selectOption(preferred);
          logger.info({ phase: 'CHECKOUT' }, `  Nationality selected: ${preferred} ✅`);
        }
        break;
      }
    }
  } catch {}

  // Select identity type (if dropdown exists)
  try {
    const identitySelectors = [
      scoped(SELECTORS.checkout.identityTypeSelect),
      scoped('select[name*="identity" i]'),
      scoped('select[name*="tipe" i]'),
    ];
    for (const sel of identitySelectors) {
      const identitySelect = await page.$(sel);
      if (identitySelect && await identitySelect.isVisible()) {
        await identitySelect.selectOption(buyer.identity_type);
        logger.info({ phase: 'CHECKOUT' }, `  Identity type: ${buyer.identity_type} ✅`);
        break;
      }
    }
  } catch {}
}

/**
 * Try multiple selectors to fill a field
 */
async function tryFillField(
  page: Page,
  selectors: string[],
  value: string,
  config: WarConfig,
  logger: any,
  fieldName: string
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const selectorParts = selector.split(', ');
      for (const sel of selectorParts) {
        const element = await page.$(sel.trim());
        if (element) {
          const visible = await element.isVisible().catch(() => false);
          if (visible) {
            await element.scrollIntoViewIfNeeded().catch(() => {});
            // Click first, then clear, then type
            await element.click();
            await page.waitForTimeout(100);
            await page.keyboard.press('Meta+a');
            await page.waitForTimeout(50);
            await element.fill(value);
            await page.waitForTimeout(200);
            logger.info({ phase: 'CHECKOUT' }, `  ${fieldName}: ✅`);
            return true;
          }
        }
      }
    } catch {
      continue;
    }
  }

  logger.warn({ phase: 'CHECKOUT' }, `  ${fieldName}: ⚠️ Field tidak ditemukan`);
  return false;
}

/**
 * Check all terms & conditions checkboxes
 */
async function checkTermsAndConditions(page: Page, config: WarConfig, logger: any): Promise<void> {
  try {
    // Find all checkboxes
    const checkboxSelectors = [
      SELECTORS.checkout.termsCheckbox,
      'input[type="checkbox"]',
      '[role="checkbox"]',
    ];
    
    for (const selector of checkboxSelectors) {
      const sels = selector.split(', ');
      for (const sel of sels) {
        const checkboxes = await page.$$(sel);
        for (const checkbox of checkboxes) {
          try {
            const visible = await checkbox.isVisible().catch(() => false);
            if (!visible) continue;
            const isChecked = await checkbox.isChecked().catch(() => false);
            if (!isChecked) {
              await checkbox.scrollIntoViewIfNeeded().catch(() => {});
              await checkbox.check().catch(async () => {
                // fallback: click directly
                await checkbox.click();
              });
              await humanDelay(config.behavior);
            }
          } catch {}
        }
      }
    }

    // Also try label clicks (some sites use styled labels for checkboxes)
    const labelSelectors = [
      'label:has-text("syarat")',
      'label:has-text("terms")',
      'label:has-text("setuju")',
      'label:has-text("agree")',
      'label:has-text("kebijakan")',
      'label:has-text("policy")',
    ];
    
    for (const sel of labelSelectors) {
      try {
        const labels = await page.$$(sel);
        for (const label of labels) {
          const visible = await label.isVisible().catch(() => false);
          if (visible) {
            await label.click();
            await humanDelay(config.behavior);
          }
        }
      } catch {}
    }

    logger.info({ phase: 'CHECKOUT' }, '  Terms & Conditions: ✅');
  } catch (error) {
    logger.warn({ phase: 'CHECKOUT' }, '  Terms & Conditions: ⚠️ Tidak bisa dicentang');
  }
}

/**
 * Click the continue/submit/pay button
 */
async function clickContinueButton(page: Page, config: WarConfig, logger: any): Promise<void> {
  const continueSelectors = [
    ...SELECTORS.checkout.continueButton.split(', '),
    'button:has-text("Lanjutkan")',
    'button:has-text("Lanjutkan Pembayaran")',
    'button:has-text("Proses")',
    'button:has-text("Proses Pembayaran")',
    'button:has-text("Checkout")',
    'button:has-text("Pembayaran")',
    'button:has-text("Payment")',
    'button:has-text("Lanjut ke Pembayaran")',
    'a:has-text("Lanjut")',
    'a:has-text("Bayar")',
    'button[type="submit"]',
    // CSS class patterns
    'button[class*="submit" i]',
    'button[class*="continue" i]',
    'button[class*="checkout" i]',
    'button[class*="payment" i]',
    'button[class*="primary" i]:not(:has-text("Verifikasi"))',
  ];

  for (const selector of continueSelectors) {
    try {
      const elements = await page.$$(selector);
      for (const el of elements) {
        const visible = await el.isVisible().catch(() => false);
        const disabled = await el.isDisabled().catch(() => false);
        if (visible && !disabled) {
          const text = (await el.textContent() || '').trim();
          // Skip verify buttons
          if (text.toLowerCase().includes('verifikasi')) continue;
          
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await el.click();
          logger.info({ phase: 'CHECKOUT' }, `  Tombol continue diklik: "${text.substring(0, 40)}"`);
          return;
        }
      }
    } catch {
      continue;
    }
  }

  // Last resort: try form submit via Enter
  try {
    await page.keyboard.press('Enter');
    logger.info({ phase: 'CHECKOUT' }, '  Submit via Enter key');
    return;
  } catch {}

  throw new Error('Tidak bisa menemukan tombol Lanjut/Bayar');
}

/**
 * Helper to generate random dummy buyer values if placeholders are used in the config.
 */
function getBuyerValue(field: keyof Buyer, rawValue: string): string {
  const isPlaceholderName = rawValue.includes('NAMA LENGKAP') || rawValue.includes('SESUAI KTP') || rawValue.includes('KEDUA');
  const isPlaceholderId = rawValue.includes('3201234567890001') || rawValue.includes('3201234567890002') || rawValue.includes('123456789');
  const isPlaceholderEmail = rawValue.includes('email@gmail.com') || rawValue.includes('email2@gmail.com');
  const isPlaceholderPhone = rawValue.includes('081234567890') || rawValue.includes('081234567891');

  if (field === 'full_name' && isPlaceholderName) {
    const firstNames = ['Budi', 'Joko', 'Andi', 'Siti', 'Dewi', 'Rudi', 'Galeh', 'Bambang', 'Wawan'];
    const lastNames = ['Prasetyo', 'Santoso', 'Hidayat', 'Wibowo', 'Kusuma', 'Siregar', 'Setiawan'];
    const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
    const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
    return `${fn} ${ln}`;
  }
  if (field === 'identity_number' && isPlaceholderId) {
    let nik = '3201';
    for (let i = 0; i < 12; i++) {
      nik += Math.floor(Math.random() * 10).toString();
    }
    return nik;
  }
  if (field === 'email' && isPlaceholderEmail) {
    const rand = Math.floor(Math.random() * 10000);
    return `testbuyer${rand}@gmail.com`;
  }
  if (field === 'phone' && isPlaceholderPhone) {
    let phone = '0878';
    for (let i = 0; i < 8; i++) {
      phone += Math.floor(Math.random() * 10).toString();
    }
    return phone;
  }
  return rawValue;
}
