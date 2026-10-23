const express = require('express');
const { getDatabaseStatus } = require('../config/db');

const router = express.Router();

router.get('/', (req, res) => {
  const dbStatus = getDatabaseStatus();
  const isDbHealthy = dbStatus.status === 'connected';

  const responsePayload = {
    status: isDbHealthy ? 'ok' : 'degraded',
    service: 'orbita-server',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: dbStatus
  };

  // Return HTTP 200 even if degraded so monitors can read the status payload
  res.status(200).json(responsePayload);
});

module.exports = router;
