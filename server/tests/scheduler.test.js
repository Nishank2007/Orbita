const {
  detectOverlap,
  findFreeSlots,
  getDayBounds
} = require('../src/services/scheduler');

describe('Scheduling Engine - Pure Domain Logic (No DB Required)', () => {
  describe('detectOverlap()', () => {
    const existingBlock = {
      id: 'blk_1',
      title: 'Existing Standup',
      startTime: '2026-10-22T10:00:00.000Z',
      endTime: '2026-10-22T11:00:00.000Z'
    };

    it('should return false when candidate is completely before existing block', () => {
      const candidate = {
        startTime: '2026-10-22T08:30:00.000Z',
        endTime: '2026-10-22T09:30:00.000Z'
      };
      const result = detectOverlap(candidate, [existingBlock]);
      expect(result.hasOverlap).toBe(false);
      expect(result.conflictingBlock).toBeNull();
    });

    it('should return false when candidate is completely after existing block', () => {
      const candidate = {
        startTime: '2026-10-22T11:30:00.000Z',
        endTime: '2026-10-22T12:30:00.000Z'
      };
      const result = detectOverlap(candidate, [existingBlock]);
      expect(result.hasOverlap).toBe(false);
      expect(result.conflictingBlock).toBeNull();
    });

    it('should allow adjacent back-to-back blocks (candidate ends when existing starts)', () => {
      const candidate = {
        startTime: '2026-10-22T09:00:00.000Z',
        endTime: '2026-10-22T10:00:00.000Z'
      };
      const result = detectOverlap(candidate, [existingBlock]);
      expect(result.hasOverlap).toBe(false);
      expect(result.conflictingBlock).toBeNull();
    });

    it('should allow adjacent back-to-back blocks (candidate starts when existing ends)', () => {
      const candidate = {
        startTime: '2026-10-22T11:00:00.000Z',
        endTime: '2026-10-22T12:00:00.000Z'
      };
      const result = detectOverlap(candidate, [existingBlock]);
      expect(result.hasOverlap).toBe(false);
      expect(result.conflictingBlock).toBeNull();
    });

    it('should detect overlap when candidate overlaps the start of existing block', () => {
      const candidate = {
        startTime: '2026-10-22T09:30:00.000Z',
        endTime: '2026-10-22T10:30:00.000Z'
      };
      const result = detectOverlap(candidate, [existingBlock]);
      expect(result.hasOverlap).toBe(true);
      expect(result.conflictingBlock.id).toBe('blk_1');
    });

    it('should detect overlap when candidate overlaps the end of existing block', () => {
      const candidate = {
        startTime: '2026-10-22T10:30:00.000Z',
        endTime: '2026-10-22T11:30:00.000Z'
      };
      const result = detectOverlap(candidate, [existingBlock]);
      expect(result.hasOverlap).toBe(true);
      expect(result.conflictingBlock.id).toBe('blk_1');
    });

    it('should detect overlap when candidate is strictly inside existing block', () => {
      const candidate = {
        startTime: '2026-10-22T10:15:00.000Z',
        endTime: '2026-10-22T10:45:00.000Z'
      };
      const result = detectOverlap(candidate, [existingBlock]);
      expect(result.hasOverlap).toBe(true);
    });

    it('should detect overlap when candidate encloses existing block', () => {
      const candidate = {
        startTime: '2026-10-22T09:00:00.000Z',
        endTime: '2026-10-22T12:00:00.000Z'
      };
      const result = detectOverlap(candidate, [existingBlock]);
      expect(result.hasOverlap).toBe(true);
    });

    it('should throw an error for invalid interval (endTime <= startTime)', () => {
      const candidate = {
        startTime: '2026-10-22T10:00:00.000Z',
        endTime: '2026-10-22T09:00:00.000Z'
      };
      expect(() => detectOverlap(candidate, [existingBlock])).toThrow('endTime must be strictly after startTime');
    });

    it('should throw an error if candidate is missing required timestamps', () => {
      expect(() => detectOverlap({}, [existingBlock])).toThrow('Candidate must specify both startTime and endTime');
    });
  });

  describe('findFreeSlots()', () => {
    const dayStart = '2026-10-22T08:00:00.000Z';
    const dayEnd = '2026-10-22T18:00:00.000Z'; // 10-hour window = 600 mins

    it('should return entire window if schedule is empty', () => {
      const slots = findFreeSlots({
        existingBlocks: [],
        dayStart,
        dayEnd,
        durationMinutes: 60
      });

      expect(slots).toHaveLength(1);
      expect(slots[0].startTime).toBe(dayStart);
      expect(slots[0].endTime).toBe(dayEnd);
      expect(slots[0].durationMinutes).toBe(600);
    });

    it('should return 0 slots if calendar is completely booked', () => {
      const existingBlocks = [
        { startTime: '2026-10-22T08:00:00.000Z', endTime: '2026-10-22T18:00:00.000Z' }
      ];

      const slots = findFreeSlots({
        existingBlocks,
        dayStart,
        dayEnd,
        durationMinutes: 30
      });

      expect(slots).toHaveLength(0);
    });

    it('should return slots before and after a single middle block', () => {
      const existingBlocks = [
        { startTime: '2026-10-22T12:00:00.000Z', endTime: '2026-10-22T13:00:00.000Z' }
      ];

      const slots = findFreeSlots({
        existingBlocks,
        dayStart,
        dayEnd,
        durationMinutes: 60
      });

      expect(slots).toHaveLength(2);
      expect(slots[0]).toEqual({
        startTime: '2026-10-22T08:00:00.000Z',
        endTime: '2026-10-22T12:00:00.000Z',
        durationMinutes: 240
      });
      expect(slots[1]).toEqual({
        startTime: '2026-10-22T13:00:00.000Z',
        endTime: '2026-10-22T18:00:00.000Z',
        durationMinutes: 300
      });
    });

    it('should filter out gaps smaller than requested durationMinutes', () => {
      const existingBlocks = [
        { startTime: '2026-10-22T08:00:00.000Z', endTime: '2026-10-22T10:00:00.000Z' },
        // 30 minute gap (10:00 to 10:30)
        { startTime: '2026-10-22T10:30:00.000Z', endTime: '2026-10-22T12:00:00.000Z' },
        // 120 minute gap (12:00 to 14:00)
        { startTime: '2026-10-22T14:00:00.000Z', endTime: '2026-10-22T18:00:00.000Z' }
      ];

      // Request 60 minutes: the 30-min gap should be ignored
      const slots = findFreeSlots({
        existingBlocks,
        dayStart,
        dayEnd,
        durationMinutes: 60
      });

      expect(slots).toHaveLength(1);
      expect(slots[0].startTime).toBe('2026-10-22T12:00:00.000Z');
      expect(slots[0].endTime).toBe('2026-10-22T14:00:00.000Z');
      expect(slots[0].durationMinutes).toBe(120);
    });

    it('should correctly handle out-of-order blocks and overlapping existing blocks', () => {
      const existingBlocks = [
        // Out of order and overlapping
        { startTime: '2026-10-22T13:00:00.000Z', endTime: '2026-10-22T15:00:00.000Z' },
        { startTime: '2026-10-22T12:00:00.000Z', endTime: '2026-10-22T14:00:00.000Z' }
      ];

      const slots = findFreeSlots({
        existingBlocks,
        dayStart,
        dayEnd,
        durationMinutes: 60
      });

      expect(slots).toHaveLength(2);
      // Gap 1: 08:00 to 12:00 (240 mins)
      expect(slots[0].startTime).toBe('2026-10-22T08:00:00.000Z');
      expect(slots[0].endTime).toBe('2026-10-22T12:00:00.000Z');
      // Gap 2: 15:00 to 18:00 (180 mins)
      expect(slots[1].startTime).toBe('2026-10-22T15:00:00.000Z');
      expect(slots[1].endTime).toBe('2026-10-22T18:00:00.000Z');
    });

    it('should throw when durationMinutes is not positive', () => {
      expect(() => {
        findFreeSlots({ existingBlocks: [], dayStart, dayEnd, durationMinutes: 0 });
      }).toThrow('durationMinutes must be a positive number');
    });
  });

  describe('getDayBounds()', () => {
    it('should parse valid YYYY-MM-DD into accurate UTC boundaries', () => {
      const bounds = getDayBounds('2026-10-22', '09:00', '17:00');

      expect(bounds.dayStart.toISOString()).toBe('2026-10-22T09:00:00.000Z');
      expect(bounds.dayEnd.toISOString()).toBe('2026-10-22T17:00:00.000Z');
      expect(bounds.fullDayStart.toISOString()).toBe('2026-10-22T00:00:00.000Z');
      expect(bounds.fullDayEnd.toISOString()).toBe('2026-10-22T23:59:59.999Z');
    });

    it('should reject invalid date format strings', () => {
      expect(() => getDayBounds('22-10-2026')).toThrow('Invalid date format');
      expect(() => getDayBounds('invalid')).toThrow('Invalid date format');
    });

    it('should reject non-existent calendar dates', () => {
      expect(() => getDayBounds('2026-02-31')).toThrow('Invalid calendar date specified');
    });
  });
});
