/**
 * Stealth Test Script
 * 
 * Tests the browser stealth configuration against bot detection sites.
 * Run: npm run test:stealth
 */

import { launchStealthBrowser, createStealthContext } from './setup.js';
import { loadConfig } from '../../config/loader.js';
import { randomMouseJitter, humanDelay } from './human-like.js';
import { takeScreenshot } from '../utils/screenshot.js';

const BOT_DETECTION_SITES = [
  {
    name: 'Bot Sannysoft',
    url: 'https://bot.sannysoft.com/',
    description: 'Checks navigator.webdriver, plugins, languages, WebGL, etc.',
  },
  {
    name: 'PixelScan',
    url: 'https://pixelscan.net/',
    description: 'Advanced fingerprint analysis',
  },
  {
    name: 'BrowserLeaks Canvas',
    url: 'https://browserleaks.com/canvas',
    description: 'Canvas fingerprint test',
  },
  {
    name: 'CreepJS',
    url: 'https://abrahamjuliot.github.io/creepjs/',
    description: 'Comprehensive browser fingerprint analysis',
  },
];

async function runStealthTest() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║          🔒 STEALTH BROWSER TEST                     ║
║          Testing anti-bot detection                   ║
╚══════════════════════════════════════════════════════╝
  `);

  const config = loadConfig();
  
  console.log('📦 Launching stealth browser...');
  const browser = await launchStealthBrowser(config);
  const context = await createStealthContext(browser, config);
  const page = await context.newPage();

  for (const site of BOT_DETECTION_SITES) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`🔍 Testing: ${site.name}`);
    console.log(`   URL: ${site.url}`);
    console.log(`   ${site.description}`);
    console.log(`${'─'.repeat(50)}`);

    try {
      await page.goto(site.url, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Wait for page to fully load and run its tests
      await page.waitForTimeout(5000);

      // Simulate some human behavior
      await randomMouseJitter(page, 2000);

      // Take screenshot
      const screenshotPath = await takeScreenshot(page, `stealth-test-${site.name.toLowerCase().replace(/\s+/g, '-')}`, 'test');
      console.log(`📸 Screenshot saved: ${screenshotPath}`);

      // Try to extract results
      if (site.name === 'Bot Sannysoft') {
        await extractSannysoftResults(page);
      } else if (site.name === 'PixelScan') {
        await page.waitForTimeout(10000); // PixelScan needs more time
        await takeScreenshot(page, 'stealth-test-pixelscan-full', 'test');
      }

    } catch (error) {
      console.log(`   ⚠️ Error testing ${site.name}: ${error}`);
    }
  }

  // Additional test: Check navigator properties
  console.log(`\n${'─'.repeat(50)}`);
  console.log('🔍 Navigator Properties Check');
  console.log(`${'─'.repeat(50)}`);

  const navCheck = await page.evaluate(() => {
    return {
      webdriver: navigator.webdriver,
      languages: navigator.languages,
      plugins: navigator.plugins.length,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: (navigator as any).deviceMemory,
      maxTouchPoints: navigator.maxTouchPoints,
      // @ts-ignore
      chrome: !!window.chrome,
      // @ts-ignore
      chromeRuntime: !!window.chrome?.runtime,
    };
  });

  console.log(`   webdriver: ${navCheck.webdriver} ${navCheck.webdriver === false ? '✅' : '❌'}`);
  console.log(`   languages: ${JSON.stringify(navCheck.languages)} ${navCheck.languages.length > 0 ? '✅' : '❌'}`);
  console.log(`   plugins: ${navCheck.plugins} ${navCheck.plugins > 0 ? '✅' : '❌'}`);
  console.log(`   platform: ${navCheck.platform}`);
  console.log(`   hardwareConcurrency: ${navCheck.hardwareConcurrency}`);
  console.log(`   chrome object: ${navCheck.chrome ? '✅' : '❌'}`);
  console.log(`   chrome.runtime: ${navCheck.chromeRuntime ? '✅' : '❌'}`);

  // Test tiket.com access
  console.log(`\n${'─'.repeat(50)}`);
  console.log('🔍 Tiket.com Access Test');
  console.log(`${'─'.repeat(50)}`);

  try {
    await page.goto('https://www.tiket.com/id-id', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    
    const title = await page.title();
    console.log(`   Page title: ${title}`);

    const blocked = await page.$('text=Access Denied').catch(() => null) ||
                    await page.$('text=blocked').catch(() => null) ||
                    await page.$('text=captcha').catch(() => null);

    if (blocked) {
      console.log('   ❌ Access mungkin diblokir! Cek screenshot.');
    } else {
      console.log('   ✅ Tiket.com accessible!');
    }

    await takeScreenshot(page, 'stealth-test-tiketcom', 'test');
  } catch (error) {
    console.log(`   ⚠️ Error accessing tiket.com: ${error}`);
  }

  console.log('\n📸 Semua screenshot tersimpan di folder /screenshots/');
  console.log('   Periksa screenshot untuk detail hasil test.\n');

  await browser.close();
  console.log('✅ Stealth test selesai!\n');
}

async function extractSannysoftResults(page: any) {
  try {
    // Get all test results from the table
    const results = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tr');
      const data: Array<{ test: string; result: string; passed: boolean }> = [];
      
      rows.forEach((row: Element) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const test = cells[0]?.textContent?.trim() || '';
          const result = cells[1]?.textContent?.trim() || '';
          const style = (cells[1] as HTMLElement)?.style;
          const passed = !style?.color?.includes('red') && 
                        !result.toLowerCase().includes('failed') &&
                        result !== 'present';
          data.push({ test, result, passed });
        }
      });
      
      return data;
    });

    let passCount = 0;
    let failCount = 0;

    results.forEach((r: any) => {
      const icon = r.passed ? '✅' : '❌';
      if (r.passed) passCount++;
      else failCount++;
      console.log(`   ${icon} ${r.test}: ${r.result}`);
    });

    console.log(`\n   📊 Results: ${passCount} passed, ${failCount} failed`);
  } catch {
    console.log('   ⚠️ Could not extract detailed results');
  }
}

runStealthTest().catch(console.error);
