import { z } from 'zod';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { resolve } from 'path';

// === Schema Definitions ===
const AccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  presale_code: z.string().optional(),
});

const EventSchema = z.object({
  url: z.string().url(),
  name: z.string(),
  war_start_time: z.string(),
  pre_war_minutes: z.number().default(10),
});

const TicketSchema = z.object({
  category_priority: z.array(z.string()).min(1),
  quantity: z.number().min(1).max(6),
  preferred_date: z.string().optional(),
});

const BuyerSchema = z.object({
  full_name: z.string().min(1),
  identity_number: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  identity_type: z.enum(['KTP', 'SIM', 'Passport']).default('KTP'),
});

const PaymentSchema = z.object({
  method: z.enum(['qris', 'mandiri']),
  fallback_method: z.enum(['qris', 'mandiri']).optional(),
});

const BehaviorSchema = z.object({
  headless: z.boolean().default(false),
  min_delay: z.number().default(200),
  max_delay: z.number().default(600),
  human_mouse: z.boolean().default(true),
  min_type_delay: z.number().default(30),
  max_type_delay: z.number().default(80),
  max_retries: z.number().default(5),
  retry_delay: z.number().default(2000),
  screenshot_interval: z.number().default(3000),
});

const ProxySchema = z.object({
  enabled: z.boolean().default(false),
  list: z.array(z.string()).default([]),
});

const WhatsAppSchema = z.object({
  enabled: z.boolean().default(false),
  phone: z.string().default(''),
  api_key: z.string().default(''),
});

const NotificationSchema = z.object({
  sound_alert: z.boolean().default(true),
  whatsapp: WhatsAppSchema.default({}),
});

const WarConfigSchema = z.object({
  accounts: z.array(AccountSchema).min(1),
  event: EventSchema,
  ticket: TicketSchema,
  buyers: z.array(BuyerSchema).min(1),
  payment: PaymentSchema,
  behavior: BehaviorSchema.default({}),
  proxy: ProxySchema.default({}),
  notification: NotificationSchema.default({}),
});

export type WarConfig = z.infer<typeof WarConfigSchema>;
export type Account = z.infer<typeof AccountSchema>;
export type Buyer = z.infer<typeof BuyerSchema>;

// === Config Loader ===
export function loadConfig(configPath?: string): WarConfig {
  const path = configPath || resolve(process.cwd(), 'config', 'war-config.yaml');
  
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = parse(raw);
    const config = WarConfigSchema.parse(parsed);
    
    // Validate: buyers count >= ticket quantity
    if (config.buyers.length < config.ticket.quantity) {
      throw new Error(
        `Jumlah buyer data (${config.buyers.length}) harus >= jumlah tiket (${config.ticket.quantity})`
      );
    }

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Config validation error:');
      error.errors.forEach((e) => {
        console.error(`  - ${e.path.join('.')}: ${e.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

export function getWarStartTime(config: WarConfig): Date {
  return new Date(config.event.war_start_time);
}

export function getPreWarTime(config: WarConfig): Date {
  const warStart = getWarStartTime(config);
  return new Date(warStart.getTime() - config.event.pre_war_minutes * 60 * 1000);
}
