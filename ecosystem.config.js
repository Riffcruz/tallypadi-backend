// ecosystem.config.js  – PM2 process manager config
// Usage:
//   pm2 start ecosystem.config.js        (start both)
//   pm2 restart ecosystem.config.js      (restart both)
//   pm2 logs                             (tail all logs)
//   pm2 monit                            (live CPU/memory dashboard)

module.exports = {
  apps: [
    // ─────────────────────────────────────────────
    // 1. HTTP API Server (Express + Socket.IO)
    //    Handles: REST API, Webhooks, BullBoard UI
    //    Does NOT run workers.
    // ─────────────────────────────────────────────
    {
      name: 'tallypadi-api',
      script: 'dist/server.js',
      instances: 1,             // Scale to 2+ with 'cluster' mode when needed
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ─────────────────────────────────────────────
    // 2. Worker Process (BullMQ consumers)
    //    Handles: Incoming WhatsApp messages,
    //             Gemini parsing, outbound replies,
    //             bulk messages, push notifications.
    //    Completely isolated from HTTP server CPU.
    // ─────────────────────────────────────────────
    {
      name: 'tallypadi-worker',
      script: 'dist/worker.js',
      instances: 1,             // Run 2 for higher throughput at 50K+ users
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,      // Slightly longer delay — let Redis/Mongo settle
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
