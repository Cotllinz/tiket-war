import { loadConfig, getWarStartTime, getPreWarTime } from './config/loader.js';
import { Orchestrator } from './bot/orchestrator.js';
import { notifyPaymentReached } from './notifier/index.js';
import logger from './logger/index.js';

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║          🎫 TICKET WAR AUTOMATION v1.0               ║
║          BABYMONSTER CHOOM IN JAKARTA 2026            ║
╚══════════════════════════════════════════════════════╝
  `);

  // Load config
  const config = loadConfig();
  const warStartTime = getWarStartTime(config);
  const preWarTime = getPreWarTime(config);
  const now = new Date();

  console.log(`📋 Event: ${config.event.name}`);
  console.log(`⏰ War Start: ${warStartTime.toLocaleString('id-ID')}`);
  console.log(`👤 Accounts: ${config.accounts.length}`);
  console.log(`🎫 Target: ${config.ticket.category_priority.join(' > ')}`);
  console.log(`💳 Payment: ${config.payment.method} (fallback: ${config.payment.fallback_method || 'none'})`);
  console.log(`🔒 Proxy: ${config.proxy.enabled ? `${config.proxy.list.length} proxies` : 'disabled'}`);
  console.log('');

  // Check if we should wait
  if (now < preWarTime) {
    const waitMs = preWarTime.getTime() - now.getTime();
    const waitMinutes = Math.ceil(waitMs / 60000);
    console.log(`⏳ Menunggu ${waitMinutes} menit sampai ${config.event.pre_war_minutes} menit sebelum war...`);
    console.log(`   Pre-war start: ${preWarTime.toLocaleString('id-ID')}`);
    console.log(`   War start:     ${warStartTime.toLocaleString('id-ID')}`);
    console.log('');

    // Countdown
    await countdown(preWarTime);
  }

  // Start orchestrator
  console.log('🚀 MEMULAI WAR TIKET!\n');
  
  const orchestrator = new Orchestrator(config);

  // Handle notifications
  orchestrator.on('paymentReached', async ({ workerId, result }) => {
    await notifyPaymentReached(
      config, workerId,
      result.method || 'unknown',
      result.paymentInfo || 'Lihat browser'
    );
  });

  orchestrator.on('completed', (summary) => {
    console.log(`\n📊 War selesai: ${summary.successCount}/${summary.totalWorkers} berhasil`);
    if (summary.successCount === 0) {
      console.log('💔 Tidak ada tiket yang berhasil dipesan. Coba lagi!');
    }
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n⏹️ Menghentikan war...');
    await orchestrator.stopAll();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await orchestrator.stopAll();
    process.exit(0);
  });

  await orchestrator.startAll();
}

async function countdown(targetTime: Date): Promise<void> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const now = new Date();
      const diff = targetTime.getTime() - now.getTime();

      if (diff <= 0) {
        clearInterval(interval);
        console.log('⏰ WAKTU TIBA! Memulai...\n');
        resolve();
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      process.stdout.write(
        `\r⏳ Countdown: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} `
      );
    }, 1000);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
