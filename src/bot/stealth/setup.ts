import { chromium, type BrowserContext, type Browser } from 'playwright';
import type { WarConfig } from '../../config/loader.js';

/**
 * Stealth browser setup module.
 * Configures Playwright to avoid bot detection.
 */

// Realistic Chrome User-Agent for macOS
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
];

const VIEWPORT_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1366, height: 768 },
];

/**
 * Launch a stealth browser instance
 */
export async function launchStealthBrowser(
  config: WarConfig,
  proxyUrl?: string
): Promise<Browser> {
  const launchOptions: any = {
    headless: config.behavior.headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--disable-web-security',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--start-maximized',
      // Disable automation flags
      '--disable-infobars',
      '--excludeSwitches=enable-automation',
      '--flag-switches-begin',
      '--flag-switches-end',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };

  if (proxyUrl) {
    const proxyParts = new URL(proxyUrl);
    launchOptions.proxy = {
      server: `${proxyParts.protocol}//${proxyParts.hostname}:${proxyParts.port}`,
      username: proxyParts.username || undefined,
      password: proxyParts.password || undefined,
    };
  }

  const browser = await chromium.launch(launchOptions);
  return browser;
}

/**
 * Create a stealth browser context with anti-detection measures
 */
export async function createStealthContext(
  browser: Browser,
  config: WarConfig,
  accountIndex: number = 0
): Promise<BrowserContext> {
  const userAgent = USER_AGENTS[accountIndex % USER_AGENTS.length];
  const viewport = VIEWPORT_SIZES[accountIndex % VIEWPORT_SIZES.length];

  const context = await browser.newContext({
    userAgent,
    viewport,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    geolocation: { latitude: -6.2088, longitude: 106.8456 }, // Jakarta
    permissions: ['geolocation'],
    colorScheme: 'light',
    deviceScaleFactor: 1,
    hasTouch: false,
    javaScriptEnabled: true,
    ignoreHTTPSErrors: true,
    bypassCSP: true,
    extraHTTPHeaders: {
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
    },
  });

  // Apply stealth patches to every new page
  context.on('page', async (page) => {
    await applyStealthPatches(page);
  });

  return context;
}

/**
 * Apply stealth JavaScript patches to a page
 */
async function applyStealthPatches(page: any): Promise<void> {
  await page.addInitScript(() => {
    // 1. Override navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });

    // 2. Override navigator.plugins (Chrome has plugins)
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          {
            0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
            name: 'Chrome PDF Plugin',
            description: 'Portable Document Format',
            filename: 'internal-pdf-viewer',
            length: 1,
          },
          {
            0: { type: 'application/pdf', suffixes: 'pdf', description: '' },
            name: 'Chrome PDF Viewer',
            description: '',
            filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
            length: 1,
          },
          {
            0: { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' },
            name: 'Native Client',
            description: '',
            filename: 'internal-nacl-plugin',
            length: 2,
          },
        ];
        // @ts-ignore
        plugins.__proto__ = PluginArray.prototype;
        return plugins;
      },
    });

    // 3. Override navigator.languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['id-ID', 'id', 'en-US', 'en'],
    });

    // 4. Override permissions.query for notifications
    const originalQuery = window.navigator.permissions.query;
    // @ts-ignore
    window.navigator.permissions.query = (parameters: any) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission } as PermissionStatus);
      }
      return originalQuery.call(window.navigator.permissions, parameters);
    };

    // 5. Override chrome.runtime to appear as regular Chrome
    // @ts-ignore
    window.chrome = {
      runtime: {
        onMessage: {
          addListener: () => {},
          removeListener: () => {},
        },
        sendMessage: () => {},
        connect: () => {},
      },
      loadTimes: () => ({
        requestTime: Date.now() / 1000,
        startLoadTime: Date.now() / 1000,
        commitLoadTime: Date.now() / 1000,
        finishDocumentLoadTime: Date.now() / 1000,
        finishLoadTime: Date.now() / 1000,
        firstPaintTime: Date.now() / 1000,
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        wasFetchedViaSpdy: false,
        wasNpnNegotiated: true,
        npnNegotiatedProtocol: 'h2',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'h2',
      }),
      csi: () => ({
        startE: Date.now(),
        onloadT: Date.now(),
        pageT: Date.now(),
      }),
    };

    // 6. Fix iframe contentWindow detection
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init: ShadowRootInit) {
      if (init && init.mode === 'open') {
        return originalAttachShadow.call(this, init);
      }
      return originalAttachShadow.call(this, init);
    };

    // 7. Override canvas fingerprint (subtle randomization)
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (type?: string) {
      if (type === 'image/png' || type === undefined) {
        const context = this.getContext('2d');
        if (context) {
          // Add imperceptible noise to canvas
          const imageData = context.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            // Subtle random pixel modification (±1 for alpha channel only)
            imageData.data[i + 3] = Math.max(0, Math.min(255,
              imageData.data[i + 3] + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 2)
            ));
          }
          context.putImageData(imageData, 0, 0);
        }
      }
      return originalToDataURL.call(this, type);
    };

    // 8. WebGL vendor/renderer spoofing
    const getParameterOriginal = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
      // UNMASKED_VENDOR_WEBGL
      if (parameter === 37445) {
        return 'Google Inc. (Apple)';
      }
      // UNMASKED_RENDERER_WEBGL
      if (parameter === 37446) {
        return 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)';
      }
      return getParameterOriginal.call(this, parameter);
    };

    // 9. Prevent connection tracking via WebRTC
    // @ts-ignore
    if (window.RTCPeerConnection) {
      const originalRTC = window.RTCPeerConnection;
      // @ts-ignore
      window.RTCPeerConnection = function (...args: any[]) {
        const pc = new originalRTC(...args);
        // Prevent enumeration of local candidates (IP leak)
        const originalAddIceCandidate = pc.addIceCandidate.bind(pc);
        pc.addIceCandidate = function (candidate: any) {
          if (candidate && candidate.candidate && candidate.candidate.includes('.local')) {
            return Promise.resolve();
          }
          return originalAddIceCandidate(candidate);
        };
        return pc;
      };
      // @ts-ignore
      window.RTCPeerConnection.prototype = originalRTC.prototype;
    }

    // 10. Console.debug message (some sites check this)
    console.debug = (() => {
      const original = console.debug;
      return (...args: any[]) => original.apply(console, args);
    })();
  });
}

/**
 * Get a random user agent from the pool
 */
export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}
