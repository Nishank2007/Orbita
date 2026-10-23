const app = require('./app');
const config = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');

async function startServer() {
  try {
    console.log(`[ORBITA] Starting server in ${config.nodeEnv} mode...`);

    // Connect to MongoDB
    try {
      await connectDB();
    } catch (dbErr) {
      console.warn(`[ORBITA] Initial DB connection failed (${dbErr.message}). Continuing in degraded mode.`);
    }

    const server = app.listen(config.port, () => {
      console.log(`[ORBITA] Server running on http://localhost:${config.port}`);
      console.log(`[ORBITA] Health check available at http://localhost:${config.port}/health`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n[ORBITA] Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectDB();
        console.log('[ORBITA] Server and DB connections closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    return server;
  } catch (error) {
    console.error('[ORBITA] Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
