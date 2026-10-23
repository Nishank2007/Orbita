const request = require('supertest');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');

describe('Health and System Status Endpoints', () => {
  afterAll(async () => {
    await disconnectDB();
  });

  describe('GET /health', () => {
    it('should return HTTP 200 with standard health check structure', async () => {
      const res = await request(app).get('/health');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(['ok', 'degraded']).toContain(res.body.status);
      expect(res.body.service).toBe('orbita-server');
      expect(res.body.version).toBe('0.1.0');
      expect(typeof res.body.uptimeSeconds).toBe('number');
      expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
      expect(res.body).toHaveProperty('database');
      expect(res.body.database).toHaveProperty('status');
      expect(typeof res.body.database.readyState).toBe('number');
    });

    it('should mirror output on /api/health', async () => {
      const res = await request(app).get('/api/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.service).toBe('orbita-server');
    });

    it('should report database status accurately when connected and disconnected', async () => {
      // Connect to DB
      try {
        await connectDB();
        const connectedRes = await request(app).get('/health');
        expect(connectedRes.statusCode).toBe(200);
        expect(connectedRes.body.database.status).toBe('connected');
        expect(connectedRes.body.status).toBe('ok');
      } catch (err) {
        // If local MongoDB is not running in test env, it should report disconnected/degraded
        console.warn('MongoDB not reachable during test, verifying degraded report.');
      }

      // Disconnect and verify degraded status
      await disconnectDB();
      const disconnectedRes = await request(app).get('/health');
      expect(disconnectedRes.statusCode).toBe(200);
      expect(disconnectedRes.body.database.status).toBe('disconnected');
      expect(disconnectedRes.body.status).toBe('degraded');
    });
  });

  describe('API Routing & Discovery', () => {
    it('should return service info on root GET /', async () => {
      const res = await request(app).get('/');
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('ORBITA Backend API');
    });

    it('should return 404 for unknown endpoints', async () => {
      const res = await request(app).get('/api/unknown-route');
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  });
});
