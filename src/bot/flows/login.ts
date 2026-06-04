import type { Page } from 'playwright';
import type { WarConfig, Account } from '../../config/loader.js';
import { SELECTORS } from '../utils/selectors.js';
import { humanClick, humanType, humanDelay, waitForPageReady } from '../stealth/human-like.js';
import { takeScreenshot } from '../utils/screenshot.js';
import { retry } from '../utils/retry.js';

export type LoginResult = {
  success: boolean;
  needsOtp: boolean;
  error?: string;
};

/**
 * Login to tiket.com with the given account credentials
 */
export async function loginFlow(
  page: Page,
  account: Account,
  config: WarConfig,
  logger: any,
  workerId: string
): Promise<LoginResult> {
  const identifier = account.phone || account.email;
  logger.info({ phase: 'LOGIN' }, `Memulai login untuk ${identifier}...`);

  try {
    // Step 1: Navigate to tiket.com
    await page.goto('https://www.tiket.com/id-id', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await waitForPageReady(page);
    await humanDelay(config.behavior);

    // Dismiss any popups/cookie consent
    await dismissPopups(page);

    // Step 2: Check if already logged in
    const isLoggedIn = await checkLoggedIn(page);
    if (isLoggedIn) {
      logger.info({ phase: 'LOGIN' }, '✅ Sudah login sebelumnya');
      return { success: true, needsOtp: false };
    }

    // Step 3: Click login button
    logger.info({ phase: 'LOGIN' }, 'Klik tombol Masuk...');
    const loginBtnClicked = await clickLoginButton(page, config);
    if (!loginBtnClicked) {
      throw new Error('Tidak bisa menemukan tombol login');
    }
    await humanDelay(config.behavior);

    // Step 4: Wait for login form
    await page.waitForSelector(SELECTORS.login.emailInput, { timeout: 10000 }).catch(() => {});
    
    // Some sites have email-first flow
    // Try email login tab first (only if using email)
    if (account.email) {
      try {
        await page.click(SELECTORS.login.emailLoginTab, { timeout: 3000 });
        await humanDelay(config.behavior);
      } catch {
        // Email tab might not exist, continue
      }
    }

    // Step 5: Enter identifier (email or phone)
    if (!identifier) {
      throw new Error('No email or phone number provided for login');
    }
    logger.info({ phase: 'LOGIN' }, `Memasukkan email/no HP: ${identifier}`);
    await humanType(page, SELECTORS.login.emailInput, identifier, config.behavior);
    await humanDelay(config.behavior);

    // Try clicking continue (some sites have 2-step login)
    try {
      await page.click(SELECTORS.login.continueButton, { timeout: 3000 });
      await humanDelay(config.behavior);
      await page.waitForTimeout(1000);
    } catch {
      // Continue button might not exist, password might be on same page
    }

    // Step 6: Enter password (only if password is provided)
    if (account.password) {
      logger.info({ phase: 'LOGIN' }, 'Memasukkan password...');
      try {
        await page.waitForSelector(SELECTORS.login.passwordInput, { timeout: 5000 });
        await humanType(page, SELECTORS.login.passwordInput, account.password, config.behavior);
        await humanDelay(config.behavior);
      } catch {
        logger.warn({ phase: 'LOGIN' }, 'Password field tidak ditemukan, mungkin flow OTP');
      }
    } else {
      logger.info({ phase: 'LOGIN' }, 'Tidak ada password yang dikonfigurasi, melewati input password.');
    }

    // Step 7: Submit login
    logger.info({ phase: 'LOGIN' }, 'Submit login...');
    try {
      await humanClick(page, SELECTORS.login.submitButton, config.behavior);
    } catch {
      // Try pressing Enter instead
      await page.keyboard.press('Enter');
    }

    // Step 8: Wait for result
    await page.waitForTimeout(3000);

    // Check for OTP requirement
    const otpField = await page.$(SELECTORS.login.otpInput).catch(() => null);
    if (otpField) {
      logger.warn({ phase: 'LOGIN' }, '⚠️ OTP diperlukan! Masukkan OTP melalui dashboard.');
      await takeScreenshot(page, 'otp-required', workerId);
      return { success: false, needsOtp: true };
    }

    // Check for successful login
    const loggedIn = await checkLoggedIn(page);
    if (loggedIn) {
      logger.info({ phase: 'LOGIN' }, '✅ Login berhasil!');
      await takeScreenshot(page, 'login-success', workerId);
      return { success: true, needsOtp: false };
    }

    // Check for errors
    const errorEl = await page.$(SELECTORS.generic.error);
    if (errorEl) {
      const errorText = await errorEl.textContent();
      throw new Error(`Login gagal: ${errorText}`);
    }

    // Give it more time and check again
    await page.waitForTimeout(3000);
    const finalCheck = await checkLoggedIn(page);
    if (finalCheck) {
      logger.info({ phase: 'LOGIN' }, '✅ Login berhasil! (delayed)');
      return { success: true, needsOtp: false };
    }

    throw new Error('Login status tidak dapat diverifikasi');

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ phase: 'LOGIN' }, `❌ Login gagal: ${errMsg}`);
    await takeScreenshot(page, 'login-error', workerId);
    return { success: false, needsOtp: false, error: errMsg };
  }
}

/**
 * Submit OTP code (called from dashboard when user enters OTP)
 */
export async function submitOtp(page: Page, otp: string, config: WarConfig): Promise<boolean> {
  try {
    await humanType(page, SELECTORS.login.otpInput, otp, config.behavior);
    await humanDelay(config.behavior);
    
    // Try submit
    try {
      await page.click(SELECTORS.login.submitButton, { timeout: 3000 });
    } catch {
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(3000);
    return await checkLoggedIn(page);
  } catch {
    return false;
  }
}

async function checkLoggedIn(page: Page): Promise<boolean> {
  try {
    // Check for user avatar/profile element in header
    const avatar = await page.$(SELECTORS.login.userAvatar);
    if (avatar) return true;

    // Check if login button is NOT present (means already logged in)
    const loginBtn = await page.$('button:has-text("Masuk"), a:has-text("Masuk")');
    return !loginBtn;
  } catch {
    return false;
  }
}

async function clickLoginButton(page: Page, config: WarConfig): Promise<boolean> {
  const selectors = SELECTORS.login.loginButton.split(', ');
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await humanClick(page, selector, config.behavior);
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

async function dismissPopups(page: Page): Promise<void> {
  // Try to dismiss cookie consent
  try {
    await page.click(SELECTORS.generic.cookieConsent, { timeout: 2000 });
  } catch {}

  // Try to dismiss any popup
  try {
    await page.click(SELECTORS.generic.popupDismiss, { timeout: 2000 });
  } catch {}

  // Try to close any modal
  try {
    await page.click(SELECTORS.generic.modalClose, { timeout: 1000 });
  } catch {}
}
