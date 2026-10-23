/**
 * ORBITA Scheduling Engine - Pure Domain Logic
 *
 * All functions in this module are pure, deterministic, and free of database/side effects.
 */

/**
 * Checks whether candidate interval [candidateStart, candidateEnd] overlaps
 * with any block in existingBlocks.
 *
 * Interval overlap rule:
 * Two intervals [s1, e1] and [s2, e2] overlap if and only if s1 < e2 && s2 < e1.
 *
 * Back-to-back blocks (s1 === e2 or s2 === e1) do NOT overlap.
 *
 * @param {{ startTime: Date|string|number, endTime: Date|string|number }} candidate
 * @param {Array<{ id?: string, title?: string, startTime: Date|string|number, endTime: Date|string|number }>} existingBlocks
 * @returns {{ hasOverlap: boolean, conflictingBlock: object|null }}
 */
function detectOverlap(candidate, existingBlocks = []) {
  if (!candidate || !candidate.startTime || !candidate.endTime) {
    throw new Error('Candidate must specify both startTime and endTime');
  }

  const cStart = new Date(candidate.startTime).getTime();
  const cEnd = new Date(candidate.endTime).getTime();

  if (isNaN(cStart) || isNaN(cEnd)) {
    throw new Error('Invalid candidate timestamp format');
  }

  if (cEnd <= cStart) {
    throw new Error('Candidate endTime must be strictly after startTime');
  }

  for (const block of existingBlocks) {
    const bStart = new Date(block.startTime).getTime();
    const bEnd = new Date(block.endTime).getTime();

    if (isNaN(bStart) || isNaN(bEnd) || bEnd <= bStart) {
      continue;
    }

    // Overlap condition: start of one is before end of other, AND vice versa
    if (cStart < bEnd && bStart < cEnd) {
      return {
        hasOverlap: true,
        conflictingBlock: block
      };
    }
  }

  return {
    hasOverlap: false,
    conflictingBlock: null
  };
}

/**
 * Computes all continuous free time slots of at least `durationMinutes`
 * within the window [dayStart, dayEnd], accounting for existing commitments.
 *
 * Algorithm steps:
 * 1. Filter and clamp existing blocks that intersect [dayStart, dayEnd].
 * 2. Sort intervals chronologically by start time.
 * 3. Merge overlapping and contiguous busy intervals.
 * 4. Scan gaps between dayStart, the merged busy intervals, and dayEnd.
 * 5. Collect any gap whose length >= durationMinutes.
 *
 * @param {Object} params
 * @param {Array<object>} params.existingBlocks List of existing schedule blocks
 * @param {Date|string|number} params.dayStart Working window opening boundary
 * @param {Date|string|number} params.dayEnd Working window closing boundary
 * @param {number} params.durationMinutes Minimum slot duration required in minutes
 * @returns {Array<{ startTime: string, endTime: string, durationMinutes: number }>}
 */
function findFreeSlots({ existingBlocks = [], dayStart, dayEnd, durationMinutes }) {
  const windowStart = new Date(dayStart).getTime();
  const windowEnd = new Date(dayEnd).getTime();

  if (isNaN(windowStart) || isNaN(windowEnd)) {
    throw new Error('Invalid dayStart or dayEnd timestamp');
  }

  if (windowEnd <= windowStart) {
    throw new Error('dayEnd must be strictly after dayStart');
  }

  if (typeof durationMinutes !== 'number' || durationMinutes <= 0 || isNaN(durationMinutes)) {
    throw new Error('durationMinutes must be a positive number');
  }

  const durationMs = durationMinutes * 60 * 1000;

  // 1. Filter and clamp intersecting blocks
  const relevantIntervals = [];
  for (const b of existingBlocks) {
    const bStart = new Date(b.startTime).getTime();
    const bEnd = new Date(b.endTime).getTime();

    if (isNaN(bStart) || isNaN(bEnd) || bEnd <= bStart) {
      continue;
    }

    // Check intersection with window
    if (bStart < windowEnd && windowStart < bEnd) {
      relevantIntervals.push({
        start: Math.max(windowStart, bStart),
        end: Math.min(windowEnd, bEnd)
      });
    }
  }

  // 2. Sort chronologically
  relevantIntervals.sort((a, b) => a.start - b.start);

  // 3. Merge contiguous / overlapping busy intervals
  const mergedBusy = [];
  for (const interval of relevantIntervals) {
    if (mergedBusy.length === 0) {
      mergedBusy.push({ ...interval });
    } else {
      const last = mergedBusy[mergedBusy.length - 1];
      if (interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
      } else {
        mergedBusy.push({ ...interval });
      }
    }
  }

  // 4. Scan gaps
  const freeSlots = [];
  let cursor = windowStart;

  for (const busy of mergedBusy) {
    if (busy.start > cursor) {
      const gapMs = busy.start - cursor;
      if (gapMs >= durationMs) {
        freeSlots.push({
          startTime: new Date(cursor).toISOString(),
          endTime: new Date(busy.start).toISOString(),
          durationMinutes: Math.floor(gapMs / (60 * 1000))
        });
      }
    }
    cursor = Math.max(cursor, busy.end);
  }

  // Final gap between last block and windowEnd
  if (windowEnd > cursor) {
    const gapMs = windowEnd - cursor;
    if (gapMs >= durationMs) {
      freeSlots.push({
        startTime: new Date(cursor).toISOString(),
        endTime: new Date(windowEnd).toISOString(),
        durationMinutes: Math.floor(gapMs / (60 * 1000))
      });
    }
  }

  return freeSlots;
}

/**
 * Converts a calendar date string (YYYY-MM-DD) into standard UTC day boundaries.
 *
 * Timezone Strategy:
 * - All server events and database documents store timestamps as UTC Date instances.
 * - When searching by calendar day, date strings without explicit time are framed as
 *   full-day UTC bounds [00:00:00.000Z, 23:59:59.999Z].
 * - Working window hours (earliest, latest, e.g. "08:00" to "20:00") are mapped to the
 *   respective hour:minute of that calendar date in UTC.
 *
 * @param {string} dateStr Format YYYY-MM-DD
 * @param {string} [earliestTime='08:00'] Format HH:mm
 * @param {string} [latestTime='20:00'] Format HH:mm
 */
function getDayBounds(dateStr, earliestTime = '08:00', latestTime = '20:00') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD');
  }

  const [year, month, day] = dateStr.split('-').map(Number);

  // Validate real calendar date
  const testDate = new Date(Date.UTC(year, month - 1, day));
  if (
    testDate.getUTCFullYear() !== year ||
    testDate.getUTCMonth() !== month - 1 ||
    testDate.getUTCDate() !== day
  ) {
    throw new Error('Invalid calendar date specified');
  }

  const parseTime = (timeStr, defaultHour, defaultMinute) => {
    if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) {
      return [defaultHour, defaultMinute];
    }
    const [h, m] = timeStr.split(':').map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) {
      return [defaultHour, defaultMinute];
    }
    return [h, m];
  };

  const [eHour, eMin] = parseTime(earliestTime, 8, 0);
  const [lHour, lMin] = parseTime(latestTime, 20, 0);

  const dayStart = new Date(Date.UTC(year, month - 1, day, eHour, eMin, 0, 0));
  const dayEnd = new Date(Date.UTC(year, month - 1, day, lHour, lMin, 0, 0));

  if (dayEnd <= dayStart) {
    throw new Error('latest working time must be strictly after earliest working time');
  }

  const fullDayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const fullDayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  return {
    dayStart,
    dayEnd,
    fullDayStart,
    fullDayEnd
  };
}

module.exports = {
  detectOverlap,
  findFreeSlots,
  getDayBounds
};
