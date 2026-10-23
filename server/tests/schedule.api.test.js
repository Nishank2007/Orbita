const request = require('supertest');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const ScheduleBlock = require('../src/models/ScheduleBlock');

/**
 * Schedule API Integration Tests
 *
 * NOTE: These tests verify real database persistence, validation constraints,
 * and HTTP response codes. They require a running MongoDB instance.
 */
describe('Schedule API Endpoints (Integration with MongoDB)', () => {
  beforeAll(async () => {
    await connectDB(process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/orbita_test');
  });

  afterAll(async () => {
    // Clean up test data and disconnect
    await ScheduleBlock.deleteMany({});
    await disconnectDB();
  });

  beforeEach(async () => {
    await ScheduleBlock.deleteMany({});
  });

  describe('POST /api/schedule/blocks (Create Block)', () => {
    it('should create a valid schedule block and return 201', async () => {
      const payload = {
        title: 'Test ML Focus Block',
        startTime: '2026-10-22T13:00:00.000Z',
        endTime: '2026-10-22T14:30:00.000Z',
        category: 'focus',
        priority: 'high'
      };

      const res = await request(app).post('/api/schedule/blocks').send(payload);

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.block).toHaveProperty('id');
      expect(res.body.block.title).toBe('Test ML Focus Block');
      expect(res.body.block.category).toBe('focus');
      expect(res.body.block.priority).toBe('high');

      // Verify in DB
      const persisted = await ScheduleBlock.findById(res.body.block.id);
      expect(persisted).not.toBeNull();
      expect(persisted.title).toBe('Test ML Focus Block');
    });

    it('should reject invalid interval where endTime <= startTime with 400', async () => {
      const payload = {
        title: 'Test Invalid Times',
        startTime: '2026-10-22T14:00:00.000Z',
        endTime: '2026-10-22T13:00:00.000Z'
      };

      const res = await request(app).post('/api/schedule/blocks').send(payload);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_INTERVAL');
    });

    it('should reject missing or empty title with 400', async () => {
      const payload = {
        title: '   ',
        startTime: '2026-10-22T14:00:00.000Z',
        endTime: '2026-10-22T15:00:00.000Z'
      };

      const res = await request(app).post('/api/schedule/blocks').send(payload);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject malformed timestamp strings with 400', async () => {
      const payload = {
        title: 'Test Bad Date',
        startTime: 'not-a-timestamp',
        endTime: '2026-10-22T15:00:00.000Z'
      };

      const res = await request(app).post('/api/schedule/blocks').send(payload);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_TIMESTAMP');
    });

    it('should reject unsupported category with 400', async () => {
      const payload = {
        title: 'Test Bad Category',
        startTime: '2026-10-22T14:00:00.000Z',
        endTime: '2026-10-22T15:00:00.000Z',
        category: 'gaming'
      };

      const res = await request(app).post('/api/schedule/blocks').send(payload);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_CATEGORY');
    });

    it('should reject overlapping blocks with HTTP 409 and details', async () => {
      // 1. Seed existing block: 10:00 - 11:30
      await ScheduleBlock.create({
        title: 'Test Existing Standup',
        startTime: new Date('2026-10-22T10:00:00.000Z'),
        endTime: new Date('2026-10-22T11:30:00.000Z'),
        category: 'meeting'
      });

      // 2. Attempt overlapping block: 11:00 - 12:00
      const overlappingPayload = {
        title: 'Test Overlapping Block',
        startTime: '2026-10-22T11:00:00.000Z',
        endTime: '2026-10-22T12:00:00.000Z'
      };

      const res = await request(app).post('/api/schedule/blocks').send(overlappingPayload);

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe('SCHEDULE_CONFLICT');
      expect(res.body.conflictingBlock.title).toBe('Test Existing Standup');
    });

    it('should allow adjacent back-to-back blocks with 201', async () => {
      // 1. Seed block: 10:00 - 11:00
      await ScheduleBlock.create({
        title: 'Test Block 1',
        startTime: new Date('2026-10-22T10:00:00.000Z'),
        endTime: new Date('2026-10-22T11:00:00.000Z')
      });

      // 2. Adjacent block starting exactly at 11:00 - 12:00
      const adjacentPayload = {
        title: 'Test Block 2 (Adjacent)',
        startTime: '2026-10-22T11:00:00.000Z',
        endTime: '2026-10-22T12:00:00.000Z'
      };

      const res = await request(app).post('/api/schedule/blocks').send(adjacentPayload);

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('success');
    });
  });

  describe('GET /api/schedule (List Blocks by Date)', () => {
    it('should list blocks for specified date', async () => {
      await ScheduleBlock.create({
        title: 'Test Morning Session',
        startTime: new Date('2026-10-22T09:00:00.000Z'),
        endTime: new Date('2026-10-22T10:00:00.000Z')
      });
      await ScheduleBlock.create({
        title: 'Test Afternoon Session',
        startTime: new Date('2026-10-22T14:00:00.000Z'),
        endTime: new Date('2026-10-22T15:00:00.000Z')
      });

      const res = await request(app).get('/api/schedule?date=2026-10-22');

      expect(res.statusCode).toBe(200);
      expect(res.body.date).toBe('2026-10-22');
      expect(res.body.count).toBe(2);
      expect(res.body.blocks[0].title).toBe('Test Morning Session');
      expect(res.body.blocks[1].title).toBe('Test Afternoon Session');
    });

    it('should return empty list if no blocks on date', async () => {
      const res = await request(app).get('/api/schedule?date=2026-10-25');
      expect(res.statusCode).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.blocks).toEqual([]);
    });

    it('should reject missing date query with 400', async () => {
      const res = await request(app).get('/api/schedule');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('MISSING_DATE');
    });

    it('should reject invalid date format with 400', async () => {
      const res = await request(app).get('/api/schedule?date=bad-date');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_DATE');
    });
  });

  describe('GET /api/schedule/free-slots (Available Slots)', () => {
    it('should calculate free slots around existing commitments', async () => {
      // 1. Seed block: 10:00 to 12:00 UTC
      await ScheduleBlock.create({
        title: 'Test Morning Meeting',
        startTime: new Date('2026-10-22T10:00:00.000Z'),
        endTime: new Date('2026-10-22T12:00:00.000Z')
      });

      // Query free slots of 60 mins between 08:00 and 16:00
      const res = await request(app).get(
        '/api/schedule/free-slots?date=2026-10-22&duration=60&earliest=08:00&latest=16:00'
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.slotsCount).toBe(2);
      // Slot 1: 08:00 - 10:00 (120 mins)
      expect(res.body.availableSlots[0].startTime).toBe('2026-10-22T08:00:00.000Z');
      expect(res.body.availableSlots[0].endTime).toBe('2026-10-22T10:00:00.000Z');
      expect(res.body.availableSlots[0].durationMinutes).toBe(120);

      // Slot 2: 12:00 - 16:00 (240 mins)
      expect(res.body.availableSlots[1].startTime).toBe('2026-10-22T12:00:00.000Z');
      expect(res.body.availableSlots[1].endTime).toBe('2026-10-22T16:00:00.000Z');
      expect(res.body.availableSlots[1].durationMinutes).toBe(240);
    });

    it('should reject request missing duration with 400', async () => {
      const res = await request(app).get('/api/schedule/free-slots?date=2026-10-22');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('MISSING_DURATION');
    });

    it('should reject non-positive duration with 400', async () => {
      const res = await request(app).get('/api/schedule/free-slots?date=2026-10-22&duration=0');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_DURATION');
    });
  });
});
