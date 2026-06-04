
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { resolve } from 'path';
import { loadConfig, type WarConfig } from '../config/loader.js';
import { Orchestrator } from '../bot/orchestrator.js';
import { onLog } from '../logger/index.js';
import { notifyPaymentReached, notifyError } from '../notifier/index.js';
import { readFileSync, writeFileSync, readdirSync } from 'fs';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(express.json());
app.use(express.static(resolve(process.cwd(), 'dashboard', 'dist')));

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});

// State
let config: WarConfig;
let orchestrator: Orchestrator | null = null;

try {
  config = loadConfig();
} catch (error) {
  console.error('Failed to load config:', error);
  process.exit(1);
}

// === WebSocket ===
const wsClients: Set<WebSocket> = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log(`📡 Dashboard connected (${wsClients.size} clients)`);

  // Send current status immediately
  if (orchestrator) {
    ws.send(JSON.stringify({
      type: 'status',
      data: orchestrator.getStatus(),
    }));
  }

  ws.on('close', () => {
    wsClients.delete(ws);
  });
});

function broadcast(type: string, data: any) {
  const message = JSON.stringify({ type, data });
  wsClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

// Forward logs to WebSocket
onLog((entry) => {
  broadcast('log', entry);
});

// === REST API Routes ===

// Get config
app.get('/api/config', (req, res) => {
  const configPath = resolve(process.cwd(), 'config', 'war-config.yaml');
  const raw = readFileSync(configPath, 'utf-8');
  res.json({ config: raw });
});

// Update config
app.put('/api/config', (req, res) => {
  try {
    const configPath = resolve(process.cwd(), 'config', 'war-config.yaml');
    writeFileSync(configPath, req.body.config, 'utf-8');
    config = loadConfig();
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get bot status
app.get('/api/status', (req, res) => {
  if (!orchestrator) {
    res.json({ running: false, workers: [] });
    return;
  }
  res.json(orchestrator.getStatus());
});

// Start war
app.post('/api/start', async (req, res) => {
  if (orchestrator?.isRunning()) {
    res.status(400).json({ error: 'Already running' });
    return;
  }

  try {
    config = loadConfig();
    orchestrator = new Orchestrator(config);

    // Wire up events
    orchestrator.on('workerStatusUpdate', (status) => {
      broadcast('workerStatus', status);
    });

    orchestrator.on('screenshot', (data) => {
      broadcast('screenshot', data);
    });

    orchestrator.on('paymentReached', async ({ workerId, result }) => {
      broadcast('paymentReached', { workerId, result });
      await notifyPaymentReached(
        config, workerId,
        result.method || 'unknown',
        result.paymentInfo || 'Lihat dashboard'
      );
    });

    orchestrator.on('completed', (summary) => {
      broadcast('completed', summary);
    });

    res.json({ success: true, message: 'War started!' });

    // Start in background
    orchestrator.startAll().catch((error) => {
      console.error('Orchestrator error:', error);
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stop war
app.post('/api/stop', async (req, res) => {
  if (!orchestrator) {
    res.status(400).json({ error: 'Not running' });
    return;
  }

  await orchestrator.stopAll();
  res.json({ success: true, message: 'War stopped' });
});

// Submit OTP
app.post('/api/otp', async (req, res) => {
  const { workerId, otp } = req.body;
  if (!orchestrator || !workerId || !otp) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }

  const success = await orchestrator.submitOtp(workerId, otp);
  res.json({ success });
});

// Get screenshots list
app.get('/api/screenshots', (req, res) => {
  try {
    const dir = resolve(process.cwd(), 'screenshots');
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.png'))
      .sort()
      .reverse()
      .slice(0, 20);
    res.json({ files });
  } catch {
    res.json({ files: [] });
  }
});

// Serve screenshot files
app.use('/screenshots', express.static(resolve(process.cwd(), 'screenshots')));

// Get war start countdown
app.get('/api/countdown', (req, res) => {
  const warStart = new Date(config.event.war_start_time);
  const now = new Date();
  const diff = warStart.getTime() - now.getTime();
  res.json({
    warStartTime: config.event.war_start_time,
    remainingMs: Math.max(0, diff),
    isStarted: diff <= 0,
  });
});

// Serve dashboard for any other route
app.get('*', (req, res) => {
  res.sendFile(resolve(process.cwd(), 'dashboard', 'dist', 'index.html'));
});

// Start server
const PORT = parseInt(process.env.API_PORT || '4000');
server.listen(PORT, () => {
  console.log(`\n🖥️  Dashboard API server running at http://localhost:${PORT}`);
  console.log(`📡 WebSocket server running at ws://localhost:${PORT}`);
  console.log(`\n📋 Event: ${config.event.name}`);
  console.log(`⏰ War time: ${config.event.war_start_time}`);
  console.log(`👤 Accounts: ${config.accounts.length}`);
  console.log(`\nOpen dashboard at http://localhost:${PORT}\n`);
});

export { app, server };
