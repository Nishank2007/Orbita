const path = require('path');
const dotenv = require('dotenv');

// Load .env from server directory if not already set
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/orbita',
  agentServiceUrl: process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:8000/agent/plan',
  agentTimeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS, 10) || 10000,
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test'
};

module.exports = config;
