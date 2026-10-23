const mongoose = require('mongoose');
const config = require('./env');

const readyStateMap = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
};

/**
 * Connect to MongoDB instance
 * @param {string} [uri] Optional URI override
 */
async function connectDB(uri = config.mongoUri) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000 // 5s timeout for fast failure feedback
    });
    if (!config.isTest) {
      console.log(`[MongoDB] Connected: ${conn.connection.host}/${conn.connection.name}`);
    }
    return conn.connection;
  } catch (error) {
    if (!config.isTest) {
      console.error(`[MongoDB] Connection error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

/**
 * Retrieve current connection state and metadata
 */
function getDatabaseStatus() {
  const stateCode = mongoose.connection.readyState;
  const stateName = readyStateMap[stateCode] || 'unknown';

  return {
    status: stateName,
    readyState: stateCode,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
}

module.exports = {
  connectDB,
  disconnectDB,
  getDatabaseStatus
};
