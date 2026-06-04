import type { WarConfig } from '../config/loader.js';
import { Worker, type WorkerStatus, type WorkerPhase } from './worker.js';
import { EventEmitter } from 'events';
import logger from '../logger/index.js';
import type { PaymentResult } from './flows/payment.js';

export interface OrchestratorStatus {
  running: boolean;
  workers: WorkerStatus[];
  startedAt?: number;
  completedWorkers: number;
  successfulWorkers: number;
}

/**
 * Orchestrator manages multiple workers (one per account)
 */
export class Orchestrator extends EventEmitter {
  private config: WarConfig;
  private workers: Worker[] = [];
  private running: boolean = false;
  private startedAt?: number;

  constructor(config: WarConfig) {
    super();
    this.config = config;
  }

  /**
   * Get current status of all workers
   */
  getStatus(): OrchestratorStatus {
    return {
      running: this.running,
      workers: this.workers.map((w) => w.status),
      startedAt: this.startedAt,
      completedWorkers: this.workers.filter((w) => 
        ['payment-reached', 'completed', 'error', 'stopped'].includes(w.status.phase)
      ).length,
      successfulWorkers: this.workers.filter((w) => 
        w.status.phase === 'payment-reached' || w.status.phase === 'completed'
      ).length,
    };
  }

  /**
   * Start all workers
   */
  async startAll(): Promise<void> {
    if (this.running) {
      logger.warn('Orchestrator already running');
      return;
    }

    this.running = true;
    this.startedAt = Date.now();

    logger.info(`🚀 Starting ${this.config.accounts.length} worker(s)...`);

    // Create workers for each account
    this.workers = this.config.accounts.map((account, index) => {
      const worker = new Worker(this.config, account, index);

      // Forward events
      worker.on('statusUpdate', (status: WorkerStatus) => {
        this.emit('workerStatusUpdate', status);
      });

      worker.on('screenshot', (data: { workerId: string; base64: string }) => {
        this.emit('screenshot', data);
      });

      worker.on('paymentReached', (result: PaymentResult) => {
        this.emit('paymentReached', { workerId: worker.id, result });
        logger.info(`🎉 Worker ${worker.id} reached payment page!`);
      });

      return worker;
    });

    // Start all workers concurrently
    const promises = this.workers.map(async (worker) => {
      try {
        const result = await worker.start();
        return { workerId: worker.id, result };
      } catch (error) {
        logger.error(`Worker ${worker.id} failed: ${error}`);
        return { workerId: worker.id, result: null };
      }
    });

    // Wait for first success or all to complete
    const results = await Promise.allSettled(promises);
    
    const successCount = results.filter((r) => 
      r.status === 'fulfilled' && r.value.result?.success
    ).length;

    logger.info(`\n${'='.repeat(50)}`);
    logger.info(`📊 Hasil War Tiket:`);
    logger.info(`   Total workers: ${this.workers.length}`);
    logger.info(`   Berhasil: ${successCount}`);
    logger.info(`   Gagal: ${this.workers.length - successCount}`);
    logger.info(`${'='.repeat(50)}\n`);

    this.emit('completed', { successCount, totalWorkers: this.workers.length });
  }

  /**
   * Stop all workers
   */
  async stopAll(): Promise<void> {
    logger.info('⏹️ Stopping all workers...');
    this.running = false;
    
    await Promise.all(this.workers.map((w) => w.stop()));
    
    logger.info('All workers stopped');
    this.emit('stopped');
  }

  /**
   * Submit OTP for a specific worker
   */
  async submitOtp(workerId: string, otp: string): Promise<boolean> {
    const worker = this.workers.find((w) => w.id === workerId);
    if (!worker) {
      logger.error(`Worker ${workerId} not found`);
      return false;
    }

    return await worker.submitOtpCode(otp);
  }

  /**
   * Get a specific worker
   */
  getWorker(workerId: string): Worker | undefined {
    return this.workers.find((w) => w.id === workerId);
  }

  /**
   * Check if orchestrator is running
   */
  isRunning(): boolean {
    return this.running;
  }
}
