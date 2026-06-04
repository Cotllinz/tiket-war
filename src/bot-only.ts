/**
 * Bot-only mode — runs the bot without the dashboard server.
 * Useful for running on a VPS or in the background.
 * Run: npm run bot
 */

import { loadConfig, getWarStartTime, getPreWarTime } from './config/loader.js';
import { Orchestrator } from './bot/orchestrator.js';
import { notifyPaymentReached, notifyError } from './notifier/index.js';

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║     🎫 TICKET WAR — BOT ONLY MODE                    ║
║     BABYMONSTER CHOOM IN JAKARTA 2026                 ║
╚══════════════════════════════════════════════════════╝
  `);

  const config = loadConfig();
  const warStart = getWarStartTime(config);
  const now = new Date();

  console.log(`📋 Event: ${config.event.name}`);
  console.log(`⏰ War: ${warStart.toLocaleString('id-ID')}`);
  console.log(`👤 Accounts: ${config.accounts.length}`);
  console.log(`🎫 Priority: ${config.ticket.category_priority.join(' > ')}`);
  console.log(`💳 Payment: ${config.payment.method}`);
  console.log('');

  const orchestrator = new Orchestrator(config);

  orchestrator.on('workerStatusUpdate', (status) => {
    const emoji = {
      'idle': '💤', 'starting': '🚀', 'logging-in': '🔑',
      'otp-required': '🔐', 'navigating': '🌐', 'in-waiting-room': '⏳',
      'selecting-ticket': '🎫', 'checking-out': '🛒', 'selecting-payment': '💳',
      'payment-reached': '🎉', 'completed': '✅', 'error': '❌', 'stopped': '⏹',
    };
    console.log(`${emoji[status.phase] || '•'} [${status.id}] ${status.message}`);
  });

  orchestrator.on('paymentReached', async ({ workerId, result }) => {
    await notifyPaymentReached(
      config, workerId,
      result.method || 'unknown',
      result.paymentInfo || 'Lihat browser'
    );
  });

  process.on('SIGINT', async () => {
    console.log('\n⏹️ Stopping...');
    await orchestrator.stopAll();
    process.exit(0);
  });

  await orchestrator.startAll();
}

main().catch(console.error);
