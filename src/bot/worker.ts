import type { Browser, BrowserContext, Page } from 'playwright';
import type { WarConfig, Account } from '../config/loader.js';
import { launchStealthBrowser, createStealthContext } from './stealth/setup.js';
import { loginFlow, submitOtp } from './flows/login.js';
import { waitingRoomFlow } from './flows/waiting-room.js';
import { ticketSelectFlow } from './flows/ticket-select.js';
import { checkoutFlow } from './flows/checkout.js';
import { paymentFlow, type PaymentResult } from './flows/payment.js';
import { createWorkerLogger } from '../logger/index.js';
import { getScreenshotBase64 } from './utils/screenshot.js';
import { EventEmitter } from 'events';

export type WorkerPhase = 
  | 'idle'
  | 'starting'
  | 'logging-in'
  | 'otp-required'
  | 'navigating'
  | 'in-waiting-room'
  | 'selecting-ticket'
  | 'checking-out'
  | 'selecting-payment'
  | 'payment-reached'
  | 'completed'
  | 'error'
  | 'stopped';

export interface WorkerStatus {
  id: string;
  accountEmail: string;
  phase: WorkerPhase;
  message: string;
  queuePosition?: string;
  ticketCategory?: string;
  paymentInfo?: string;
  screenshotBase64?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

/**
 * A single worker manages one browser instance for one account
 */
export class Worker extends EventEmitter {
  public id: string;
  public status: WorkerStatus;
  
  private config: WarConfig;
  private account: Account;
  private accountIndex: number;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private logger: ReturnType<typeof createWorkerLogger>;
  private running: boolean = false;
  private screenshotInterval: NodeJS.Timeout | null = null;

  constructor(
    config: WarConfig,
    account: Account,
    accountIndex: number
  ) {
    super();
    this.config = config;
    this.account = account;
    this.accountIndex = accountIndex;
    this.id = `worker-${accountIndex + 1}`;
    this.logger = createWorkerLogger(this.id);

    this.status = {
      id: this.id,
      accountEmail: account.email || account.phone || '',
      phase: 'idle',
      message: 'Menunggu...',
    };
  }

  private updateStatus(phase: WorkerPhase, message: string, extra?: Partial<WorkerStatus>) {
    this.status = { ...this.status, phase, message, ...extra };
    this.emit('statusUpdate', this.status);
  }

  /**
   * Start the worker — full war flow
   */
  async start(): Promise<PaymentResult | null> {
    this.running = true;
    this.updateStatus('starting', 'Memulai browser...');

    try {
      // Step 1: Launch browser
      const proxyUrl = this.getProxy();
      this.browser = await launchStealthBrowser(this.config, proxyUrl);
      this.context = await createStealthContext(this.browser, this.config, this.accountIndex);
      this.page = await this.context.newPage();

      // Start screenshot capture loop
      this.startScreenshotCapture();

      // Step 2: Login
      const loginIdentifier = this.account.phone || this.account.email || 'unknown';
      this.updateStatus('logging-in', `Melakukan login untuk ${loginIdentifier}...`);
      const loginResult = await loginFlow(
        this.page, this.account, this.config, this.logger, this.id
      );

      if (loginResult.needsOtp) {
        this.updateStatus('otp-required', 'Meminta OTP. Silakan masukkan OTP di dashboard.', {
          accountEmail: loginIdentifier
        });
        
        // Wait for OTP to be submitted via dashboard
        await this.waitForOtp();
        
        if (!this.running) return null;
      } else if (!loginResult.success) {
        throw new Error(loginResult.error || 'Login gagal');
      }

      if (!this.running) return null;

      // Step 3: Navigate to event & handle waiting room
      this.updateStatus('navigating', 'Menuju halaman event...');
      const waitResult = await waitingRoomFlow(
        this.page, this.config, this.logger, this.id,
        (wrStatus) => {
          if (wrStatus.status === 'in-queue') {
            this.updateStatus('in-waiting-room', `Dalam antrian: ${wrStatus.position || '?'}`, {
              queuePosition: wrStatus.position,
            });
          }
        }
      );

      if (waitResult.status === 'error') {
        throw new Error(waitResult.error || 'Waiting room error');
      }

      if (!this.running) return null;

      // Step 4: Select tickets
      this.updateStatus('selecting-ticket', 'Memilih tiket...');
      const ticketResult = await ticketSelectFlow(
        this.page, this.config, this.account, this.logger, this.id
      );

      if (!ticketResult.success) {
        throw new Error(ticketResult.error || 'Gagal memilih tiket');
      }

      this.updateStatus('selecting-ticket', `Tiket dipilih: ${ticketResult.category}`, {
        ticketCategory: ticketResult.category,
      });

      if (!this.running) return null;

      // Step 5: Checkout
      this.updateStatus('checking-out', 'Mengisi form checkout...');
      const checkoutResult = await checkoutFlow(
        this.page, this.config, this.logger, this.id
      );

      if (!checkoutResult.success) {
        throw new Error(checkoutResult.error || 'Checkout gagal');
      }

      if (!this.running) return null;

      // Step 6: Payment
      this.updateStatus('selecting-payment', 'Memilih metode pembayaran...');
      const paymentResult = await paymentFlow(
        this.page, this.config, this.logger, this.id
      );

      if (paymentResult.success) {
        this.updateStatus('payment-reached', '🎉 BERHASIL! Segera lakukan pembayaran!', {
          paymentInfo: paymentResult.paymentInfo,
          completedAt: Date.now(),
        });

        this.logger.info({ phase: 'COMPLETE' }, '🎉🎉🎉 TIKET BERHASIL DIPESAN! SEGERA BAYAR! 🎉🎉🎉');
        this.emit('paymentReached', paymentResult);
        return paymentResult;
      } else {
        throw new Error(paymentResult.error || 'Payment gagal');
      }

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error({ phase: 'ERROR' }, `Worker error: ${errMsg}`);
      this.updateStatus('error', `Error: ${errMsg}`, { error: errMsg });
      return null;
    }
  }

  /**
   * Submit OTP code (called from dashboard)
   */
  async submitOtpCode(otp: string): Promise<boolean> {
    if (!this.page) return false;
    const success = await submitOtp(this.page, otp, this.config);
    if (success) {
      this.updateStatus('navigating', 'OTP berhasil! Lanjut ke event page...');
    }
    return success;
  }

  /**
   * Wait for OTP to be resolved
   */
  private async waitForOtp(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        if (!this.running) {
          clearInterval(checkInterval);
          resolve();
          return;
        }
        if (this.status.phase !== 'otp-required') {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    this.running = false;
    this.stopScreenshotCapture();
    
    try {
      if (this.page) await this.page.close().catch(() => {});
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    } catch {}

    this.updateStatus('stopped', 'Worker dihentikan');
    this.logger.info({ phase: 'STOP' }, 'Worker stopped');
  }

  /**
   * Get proxy URL for this worker
   */
  private getProxy(): string | undefined {
    if (!this.config.proxy.enabled || this.config.proxy.list.length === 0) {
      return undefined;
    }
    return this.config.proxy.list[this.accountIndex % this.config.proxy.list.length];
  }

  /**
   * Start periodic screenshot capture for dashboard
   */
  private startScreenshotCapture(): void {
    this.screenshotInterval = setInterval(async () => {
      if (this.page && this.running) {
        try {
          const base64 = await getScreenshotBase64(this.page);
          this.status.screenshotBase64 = base64;
          this.emit('screenshot', { workerId: this.id, base64 });
        } catch {}
      }
    }, this.config.behavior.screenshot_interval);
  }

  private stopScreenshotCapture(): void {
    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = null;
    }
  }

  /**
   * Get the current page (for external control)
   */
  getPage(): Page | null {
    return this.page;
  }
}
