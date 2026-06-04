/**
 * Dry Run Script
 * 
 * Tests the full flow without actually purchasing tickets.
 * Uses tiket.com to verify selectors and flow.
 * Run: npm run dry-run
 */

import { loadConfig } from './config/loader.js';
import { launchStealthBrowser, createStealthContext } from './bot/stealth/setup.js';
import { humanDelay, waitForPageReady, humanClick, humanScroll } from './bot/stealth/human-like.js';
import { takeScreenshot } from './bot/utils/screenshot.js';
import { SELECTORS } from './bot/utils/selectors.js';
import { createWorkerLogger } from './logger/index.js';

async function dryRun() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║          🧪 DRY RUN - TEST MODE                      ║
║          Testing bot flow tanpa pembelian              ║
╚══════════════════════════════════════════════════════╝
  `);

  const config = loadConfig();
  const logger = createWorkerLogger('dry-run');

  console.log('📦 Launching browser...\n');
  const browser = await launchStealthBrowser(config);
  const context = await createStealthContext(browser, config);
  const page = await context.newPage();

  try {
    // Test 1: Access tiket.com
    console.log('━━━ Test 1: Akses tiket.com ━━━');
    await page.goto('https://www.tiket.com/id-id', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForPageReady(page);
    
    const title = await page.title();
    console.log(`  ✅ Page loaded: ${title}`);
    await takeScreenshot(page, 'dry-run-homepage', 'dry-run');

    // Test 2: Check login button exists
    console.log('\n━━━ Test 2: Login button ━━━');
    const loginSelectors = SELECTORS.login.loginButton.split(', ');
    let loginBtnFound = false;
    for (const sel of loginSelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el) {
        console.log(`  ✅ Login button found: ${sel}`);
        loginBtnFound = true;
        break;
      }
    }
    if (!loginBtnFound) {
      console.log('  ⚠️ Login button not found with default selectors');
      console.log('     Mungkin sudah login atau layout berubah');
    }

    // Test 3: Navigate to event page
    console.log('\n━━━ Test 3: Event page ━━━');
    await page.goto(config.event.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForPageReady(page);
    await page.waitForTimeout(3000);
    
    const eventTitle = await page.title();
    console.log(`  Page: ${eventTitle}`);
    console.log(`  URL: ${page.url()}`);
    await takeScreenshot(page, 'dry-run-event-page', 'dry-run');

    // Check for waiting room
    const url = page.url();
    if (url.includes('queue') || url.includes('waiting')) {
      console.log('  ⚠️ Waiting room detected!');
    } else {
      console.log('  ✅ No waiting room (event might not be active yet)');
    }

    // Test 4: Check page structure
    console.log('\n━━━ Test 4: Page structure analysis ━━━');
    
    // Look for buy buttons
    const buySelectors = SELECTORS.ticket.addToCart.split(', ');
    for (const sel of buySelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el) {
        const text = await el.textContent().catch(() => '');
        const visible = await el.isVisible().catch(() => false);
        console.log(`  🎫 Buy button: "${text?.trim()}" (visible: ${visible}) [${sel}]`);
      }
    }

    // Look for category elements
    const catEl = await page.$(SELECTORS.ticket.categoryContainer).catch(() => null);
    if (catEl) {
      console.log('  ✅ Category container found');
    } else {
      console.log('  ℹ️ Category container not visible (normal before sale starts)');
    }

    // Test 5: Check for anti-bot measures
    console.log('\n━━━ Test 5: Anti-bot check ━━━');
    
    const captcha = await page.$('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], [class*="captcha"]').catch(() => null);
    if (captcha) {
      console.log('  ⚠️ CAPTCHA detected! Mungkin perlu manual intervention.');
    } else {
      console.log('  ✅ No CAPTCHA detected');
    }

    const blocked = await page.$('text=Access Denied, text=blocked, text=403').catch(() => null);
    if (blocked) {
      console.log('  ❌ Access mungkin diblokir!');
    } else {
      console.log('  ✅ Access not blocked');
    }

    // Test 6: Network analysis
    console.log('\n━━━ Test 6: Network analysis ━━━');
    
    const cookies = await context.cookies();
    console.log(`  🍪 Cookies: ${cookies.length}`);
    
    // Check for important cookies
    const tiketCookies = cookies.filter(c => c.domain.includes('tiket.com'));
    console.log(`  🍪 Tiket.com cookies: ${tiketCookies.length}`);
    tiketCookies.forEach(c => {
      console.log(`     - ${c.name}: ${c.value.substring(0, 30)}...`);
    });

    // Final screenshot
    await takeScreenshot(page, 'dry-run-complete', 'dry-run');

    console.log('\n' + '═'.repeat(50));
    console.log('✅ Dry run complete!');
    console.log('📸 Screenshots saved in /screenshots/');
    console.log('═'.repeat(50) + '\n');

  } catch (error) {
    console.error(`\n❌ Dry run error: ${error}`);
    await takeScreenshot(page, 'dry-run-error', 'dry-run');
  } finally {
    // Keep browser open briefly for inspection
    console.log('🔍 Menunggu 5 detik sebelum menutup browser...');
    await page.waitForTimeout(5000);
    
    await browser.close();
  }
}

dryRun().catch(console.error);
