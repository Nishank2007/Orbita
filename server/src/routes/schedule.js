const express = require('express');
const ScheduleBlock = require('../models/ScheduleBlock');
const { findFreeSlots, getDayBounds } = require('../services/scheduler');

const router = express.Router();

const VALID_CATEGORIES = ['focus', 'meeting', 'break', 'routine'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

/**
 * GET /api/schedule
 * Retrieve all schedule blocks for a specified calendar day (YYYY-MM-DD).
 */
router.get('/', async (req, res, next) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        error: 'MISSING_DATE',
        message: 'Query parameter "date" (YYYY-MM-DD) is required.'
      });
    }

    let bounds;
    try {
      bounds = getDayBounds(date);
    } catch (err) {
      return res.status(400).json({
        error: 'INVALID_DATE',
        message: err.message
      });
    }

    // Query blocks that intersect the 24-hour day boundary
    const blocks = await ScheduleBlock.find({
      startTime: { $lt: bounds.fullDayEnd },
      endTime: { $gt: bounds.fullDayStart }
    }).sort({ startTime: 1 });

    res.status(200).json({
      date,
      count: blocks.length,
      blocks
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/schedule/free-slots
 * Compute available contiguous time slots of at least duration minutes.
 */
router.get('/free-slots', async (req, res, next) => {
  try {
    const { date, duration, earliest = '08:00', latest = '20:00' } = req.query;

    if (!date) {
      return res.status(400).json({
        error: 'MISSING_DATE',
        message: 'Query parameter "date" (YYYY-MM-DD) is required.'
      });
    }

    if (!duration) {
      return res.status(400).json({
        error: 'MISSING_DURATION',
        message: 'Query parameter "duration" (in minutes) is required.'
      });
    }

    const durationMinutes = parseInt(duration, 10);
    if (isNaN(durationMinutes) || durationMinutes <= 0) {
      return res.status(400).json({
        error: 'INVALID_DURATION',
        message: 'duration must be a positive integer representing minutes.'
      });
    }

    let bounds;
    try {
      bounds = getDayBounds(date, earliest, latest);
    } catch (err) {
      return res.status(400).json({
        error: 'INVALID_BOUNDS',
        message: err.message
      });
    }

    // Query blocks overlapping the working day window
    const existingBlocks = await ScheduleBlock.find({
      startTime: { $lt: bounds.dayEnd },
      endTime: { $gt: bounds.dayStart }
    }).sort({ startTime: 1 });

    const availableSlots = findFreeSlots({
      existingBlocks,
      dayStart: bounds.dayStart,
      dayEnd: bounds.dayEnd,
      durationMinutes
    });

    res.status(200).json({
      date,
      durationMinutes,
      slotsCount: availableSlots.length,
      availableSlots
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/schedule/blocks
 * Create a new schedule block with validation and conflict detection.
 */
router.post('/blocks', async (req, res, next) => {
  try {
    const { title, startTime, endTime, category = 'focus', priority = 'medium' } = req.body;

    // 1. Field presence validation
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'title is required and cannot be empty.'
      });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Both startTime and endTime are required.'
      });
    }

    // 2. Timestamp parseability validation
    const candidateStart = new Date(startTime);
    const candidateEnd = new Date(endTime);

    if (isNaN(candidateStart.getTime()) || isNaN(candidateEnd.getTime())) {
      return res.status(400).json({
        error: 'INVALID_TIMESTAMP',
        message: 'startTime and endTime must be valid ISO-8601 timestamp strings.'
      });
    }

    // 3. Chronological validity
    if (candidateEnd.getTime() <= candidateStart.getTime()) {
      return res.status(400).json({
        error: 'INVALID_INTERVAL',
        message: 'endTime must be strictly after startTime.'
      });
    }

    // 4. Enum validation
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: 'INVALID_CATEGORY',
        message: `category must be one of: ${VALID_CATEGORIES.join(', ')}.`
      });
    }

    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        error: 'INVALID_PRIORITY',
        message: `priority must be one of: ${VALID_PRIORITIES.join(', ')}.`
      });
    }

    // 5. Overlap detection (back-to-back blocks are allowed)
    const conflictingBlock = await ScheduleBlock.findOne({
      startTime: { $lt: candidateEnd },
      endTime: { $gt: candidateStart }
    });

    if (conflictingBlock) {
      return res.status(409).json({
        error: 'SCHEDULE_CONFLICT',
        message: 'The requested block overlaps with an existing schedule block.',
        conflictingBlock: {
          id: conflictingBlock.id,
          title: conflictingBlock.title,
          startTime: conflictingBlock.startTime,
          endTime: conflictingBlock.endTime
        }
      });
    }

    // 6. Persistence
    const newBlock = await ScheduleBlock.create({
      title: title.trim(),
      startTime: candidateStart,
      endTime: candidateEnd,
      category,
      priority
    });

    res.status(201).json({
      status: 'success',
      block: newBlock
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
