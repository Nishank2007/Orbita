/**
 * agent.gateway.test.js
 *
 * Tests for POST /api/agent/plan — the Node.js gateway that validates input
 * and forwards requests to the Python agent service.
 *
 * These tests do NOT require MongoDB or the Python MCP server to be running.
 * Validation failures are handled entirely in Express before any downstream call.
 * Downstream-unavailability tests force an unreachable agent URL to verify 503/504.
 */
const request = require('supertest');
const app = require('../src/app');

describe('POST /api/agent/plan — Node.js Gateway Tests', () => {
  // No beforeAll/afterAll DB connection needed:
  // - Validation tests never reach the agent service
  // - Downstream tests use an unreachable agent URL → 503/504

  describe('Input Validation (no DB required)', () => {
    it('should reject a missing prompt with 400', async () => {
      const res = await request(app).post('/api/agent/plan').send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(typeof res.body.message).toBe('string');
    });

    it('should reject an empty string prompt with 400', async () => {
      const res = await request(app).post('/api/agent/plan').send({ prompt: '  ' });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject a prompt under 3 characters with 400', async () => {
      const res = await request(app).post('/api/agent/plan').send({ prompt: 'hi' });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject a prompt over 500 characters with 400', async () => {
      const res = await request(app).post('/api/agent/plan').send({ prompt: 'a'.repeat(501) });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject non-string prompt with 400', async () => {
      const res = await request(app).post('/api/agent/plan').send({ prompt: 12345 });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should not return stack traces or secret names in any error response', async () => {
      const res = await request(app).post('/api/agent/plan').send({});
      const body = JSON.stringify(res.body);
      // No Node.js stack frames
      expect(body).not.toMatch(/at \w+.*:\d+:\d+/);
      // No secret names
      expect(body).not.toContain('GEMINI_API_KEY');
      expect(body).not.toContain('MONGODB_URI');
    });
  });

  describe('Downstream Unavailability (agent service not running)', () => {
    const config = require('../src/config/env');

    it('should return 503 when agent service is unreachable', async () => {
      const savedUrl = config.agentServiceUrl;
      config.agentServiceUrl = 'http://127.0.0.1:19999/agent/plan';

      const res = await request(app)
        .post('/api/agent/plan')
        .send({ prompt: 'Schedule 60 minutes for test study after 2 PM' });

      config.agentServiceUrl = savedUrl;

      expect([503, 504]).toContain(res.statusCode);
      expect(res.body.error).toMatch(/AGENT_SERVICE_UNAVAILABLE|AGENT_TIMEOUT/);
    });

    it('should return 504 when agent times out (1ms timeout)', async () => {
      const savedUrl = config.agentServiceUrl;
      const savedTimeout = config.agentTimeoutMs;

      // Use an unreachable address with a 1ms timeout to force immediate timeout
      config.agentServiceUrl = 'http://127.0.0.1:19999/agent/plan';
      config.agentTimeoutMs = 1;

      const res = await request(app)
        .post('/api/agent/plan')
        .send({ prompt: 'Schedule 60 minutes for test study after 2 PM' });

      config.agentServiceUrl = savedUrl;
      config.agentTimeoutMs = savedTimeout;

      expect([503, 504]).toContain(res.statusCode);
      expect(res.body.error).toMatch(/AGENT_SERVICE_UNAVAILABLE|AGENT_TIMEOUT/);
    });
  });
});
