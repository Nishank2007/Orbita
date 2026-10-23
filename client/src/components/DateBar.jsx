import React from 'react';

export default function DateBar({ selectedDate, onDateChange, onRefresh, blocksCount, isLoading }) {
  const handlePrevDay = () => {
    const d = new Date(selectedDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    onDateChange(d.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    onDateChange(d.toISOString().slice(0, 10));
  };

  const handleToday = () => {
    const today = new Date().toISOString().slice(0, 10);
    onDateChange(today);
  };

  // Format human-readable date in UTC
  const formattedDate = (() => {
    try {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const d = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
        return d.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC'
        });
      }
    } catch {
      // fallback
    }
    return selectedDate;
  })();

  const isToday = selectedDate === new Date().toISOString().slice(0, 10);

  return (
    <div className="datebar-container">
      <div className="datebar-left">
        <div className="date-controls">
          <button
            type="button"
            className="btn-icon"
            onClick={handlePrevDay}
            aria-label="Previous day"
            id="btn-prev-day"
            title="Previous day"
          >
            ‹
          </button>

          <label className="date-input-wrap">
            <input
              type="date"
              id="date-picker-input"
              value={selectedDate}
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
              className="date-picker"
              aria-label="Select date"
            />
          </label>

          <button
            type="button"
            className="btn-icon"
            onClick={handleNextDay}
            aria-label="Next day"
            id="btn-next-day"
            title="Next day"
          >
            ›
          </button>

          <button
            type="button"
            className={`btn-today ${isToday ? 'btn-today-active' : ''}`}
            onClick={handleToday}
            id="btn-today"
          >
            Today
          </button>
        </div>

        <div className="date-text-display">
          <h2 className="current-date-title">{formattedDate}</h2>
          <span className="timezone-indicator">UTC Timeline</span>
        </div>
      </div>

      <div className="datebar-right">
        <div className="block-counter-badge">
          <span className="counter-number">{blocksCount}</span>
          <span className="counter-label">{blocksCount === 1 ? 'Commitment' : 'Commitments'}</span>
        </div>

        <button
          type="button"
          className="btn-refresh"
          onClick={onRefresh}
          disabled={isLoading}
          id="btn-refresh-schedule"
          title="Refresh schedule from MongoDB"
        >
          <span className={`refresh-icon ${isLoading ? 'spinning' : ''}`}>↻</span>
          <span>Refresh</span>
        </button>
      </div>
    </div>
  );
}
