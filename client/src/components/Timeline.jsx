import React from 'react';

const CATEGORY_META = {
  focus: {
    label: 'Focus Session',
    colorClass: 'cat-focus',
    icon: '🎯'
  },
  meeting: {
    label: 'Meeting / Sync',
    colorClass: 'cat-meeting',
    icon: '👥'
  },
  break: {
    label: 'Break / Rest',
    colorClass: 'cat-break',
    icon: '☕'
  },
  routine: {
    label: 'Routine / Habit',
    colorClass: 'cat-routine',
    icon: '🔄'
  }
};

const PRIORITY_META = {
  high: { label: 'High Priority', class: 'priority-high' },
  medium: { label: 'Medium', class: 'priority-medium' },
  low: { label: 'Low', class: 'priority-low' }
};

function formatUtcTime(isoString) {
  if (!isoString) return '--:--';
  try {
    const d = new Date(isoString);
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const minutes = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes} UTC`;
  } catch {
    return isoString;
  }
}

function calculateDurationMinutes(startIso, endIso) {
  try {
    const s = new Date(startIso).getTime();
    const e = new Date(endIso).getTime();
    const diff = Math.round((e - s) / (1000 * 60));
    return diff > 0 ? diff : 0;
  } catch {
    return 0;
  }
}

export default function Timeline({
  blocks = [],
  isLoading = false,
  newlyCreatedId = null,
  selectedDate
}) {
  return (
    <div className="timeline-card glass-panel" id="daily-timeline-section">
      <div className="timeline-header">
        <div>
          <h3 className="section-title">Daily Timeline</h3>
          <p className="section-subtitle">
            Commitments &amp; verified schedule blocks stored in MongoDB
          </p>
        </div>
        <div className="legend-row">
          <span className="legend-item"><span className="legend-dot dot-focus"></span>Focus</span>
          <span className="legend-item"><span className="legend-dot dot-meeting"></span>Meeting</span>
          <span className="legend-item"><span className="legend-dot dot-break"></span>Break</span>
          <span className="legend-item"><span className="legend-dot dot-routine"></span>Routine</span>
        </div>
      </div>

      {isLoading && (
        <div className="timeline-loading-state" role="status">
          <div className="timeline-skeleton-pulse"></div>
          <span className="loading-label">Loading schedule for {selectedDate}...</span>
        </div>
      )}

      {!isLoading && blocks.length === 0 && (
        <div className="timeline-empty-state" id="timeline-empty-state">
          <div className="empty-icon">🗓</div>
          <h4 className="empty-title">No commitments scheduled</h4>
          <p className="empty-desc">
            Your schedule on <strong>{selectedDate}</strong> is completely open. Ask ORBITA above to schedule your first block!
          </p>
        </div>
      )}

      {!isLoading && blocks.length > 0 && (
        <div className="timeline-blocks-list" id="timeline-blocks-list">
          {blocks.map((block, idx) => {
            const cat = CATEGORY_META[block.category] || CATEGORY_META.focus;
            const pri = PRIORITY_META[block.priority] || PRIORITY_META.medium;
            const duration = calculateDurationMinutes(block.startTime, block.endTime);
            const isNew = block.id === newlyCreatedId || block._id === newlyCreatedId;

            return (
              <div
                key={block.id || block._id || idx}
                className={`schedule-block-item ${cat.colorClass} ${isNew ? 'block-just-created' : ''}`}
                data-testid="schedule-block"
                id={`block-${block.id || idx}`}
              >
                <div className="block-time-gutter">
                  <span className="time-start">{formatUtcTime(block.startTime)}</span>
                  <div className="time-line-bar"></div>
                  <span className="time-end">{formatUtcTime(block.endTime)}</span>
                </div>

                <div className="block-card-content">
                  <div className="block-top-row">
                    <div className="block-title-wrap">
                      <span className="category-emoji" aria-hidden="true">{cat.icon}</span>
                      <h4 className="block-title">{block.title}</h4>
                      {isNew && (
                        <span className="new-badge" id="newly-created-badge">
                          ✨ Just Created
                        </span>
                      )}
                    </div>

                    <div className="block-badges">
                      <span className={`category-tag ${cat.colorClass}`}>
                        {cat.label}
                      </span>
                      <span className={`priority-tag ${pri.class}`}>
                        {pri.label}
                      </span>
                    </div>
                  </div>

                  <div className="block-meta-row">
                    <span className="duration-pill">
                      ⏱ {duration} minutes
                    </span>
                    <span className="meta-id" title={block.id || block._id}>
                      ID: {(block.id || block._id || '').slice(-6)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
