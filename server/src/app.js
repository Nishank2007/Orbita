const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/health');
const scheduleRoutes = require('./routes/schedule');
const agentRoutes = require('./routes/agent');
const config = require('./config/env');

const app = express();

// Standard middleware
app.use(cors());
app.use(express.json());

// Minimal request logger (non-test environments)
if (!config.isTest) {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// Health check routes
app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);

// Schedule domain routes
app.use('/api/schedule', scheduleRoutes);

// Agent gateway routes
app.use('/api/agent', agentRoutes);

// Root greeting / API discovery
app.get('/', (req, res) => {
  res.json({
    name: 'ORBITA Backend API',
    description: 'Personal Productivity Agent Core Service',
    health: '/health'
  });
});

// 404 Catch-all handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Endpoint ${req.method} ${req.originalUrl} does not exist.`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(err.status || 500).json({
    error: err.name || 'INTERNAL_ERROR',
    message: err.message || 'An unexpected server error occurred.'
  });
});

module.exports = app;
