import type { WarConfig } from '../config/loader.js';
import logger from '../logger/index.js';

/**
 * Send WhatsApp notification via CallMeBot free API
 * Setup: https://www.callmebot.com/blog/free-api-whatsapp-messages/
 * 
 * Steps to get API key:
 * 1. Add phone +34 644 58 82 34 to your contacts
 * 2. Send "I allow callmebot to send me messages" to that number
 * 3. You'll receive your API key
 */
export async function sendWhatsApp(
  config: WarConfig,
  message: string
): Promise<boolean> {
  if (!config.notification.whatsapp.enabled) return false;

  const { phone, api_key } = config.notification.whatsapp;
  if (!phone || !api_key) {
    logger.warn('WhatsApp notification not configured');
    return false;
  }

  try {
    const encodedMessage = encodeURIComponent(message);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodedMessage}&apikey=${api_key}`;

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      logger.info('✅ WhatsApp notification sent');
      return true;
    } else {
      logger.error(`WhatsApp notification failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    logger.error(`WhatsApp notification error: ${error}`);
    return false;
  }
}

/**
 * Play sound alert (using system beep)
 */
export async function playSoundAlert(config: WarConfig): Promise<void> {
  if (!config.notification.sound_alert) return;

  try {
    // Use system bell character for cross-platform beep
    process.stdout.write('\x07');
    
    // Multiple beeps for urgency
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      process.stdout.write('\x07');
    }
  } catch {}
}

/**
 * Send all configured notifications
 */
export async function notifyPaymentReached(
  config: WarConfig,
  workerId: string,
  method: string,
  paymentInfo: string
): Promise<void> {
  const message = `🎉 TICKET WAR SUCCESS! 🎉\n\n` +
    `Worker: ${workerId}\n` +
    `Event: ${config.event.name}\n` +
    `Payment Method: ${method.toUpperCase()}\n` +
    `Info: ${paymentInfo}\n\n` +
    `⚠️ SEGERA LAKUKAN PEMBAYARAN!`;

  // Sound alert
  await playSoundAlert(config);

  // WhatsApp
  await sendWhatsApp(config, message);

  logger.info(`\n${'🎉'.repeat(20)}\n`);
  logger.info(message);
  logger.info(`\n${'🎉'.repeat(20)}\n`);
}

/**
 * Notify error
 */
export async function notifyError(
  config: WarConfig,
  workerId: string,
  error: string
): Promise<void> {
  const message = `❌ TICKET WAR ERROR\n\nWorker: ${workerId}\nError: ${error}`;
  await sendWhatsApp(config, message);
}
