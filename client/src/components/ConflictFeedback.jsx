import React from 'react';

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

export default function ConflictFeedback({
  status,
  message,
  auditLog = [],
  onSelectAlternative,
  onDismiss
}) {
  if (status !== 'conflict' && status !== 'no_slot') {
    return null;
  }

  // Extract any conflicting block information from create_schedule_block audit result
  const createStep = auditLog.find(s => s.tool === 'create_schedule_block');
  const conflictingBlock = createStep?.result?.conflictingBlock || null;

  // Extract any available alternative slots from find_available_slots audit result
  const slotsStep = auditLog.find(s => s.tool === 'find_available_slots');
  const alternativeSlots = slotsStep?.result?.availableSlots || [];

  return (
    <div className={`conflict-panel glass-panel ${status === 'conflict' ? 'border-conflict' : 'border-no-slot'}`} id="conflict-feedback-panel" role="region" aria-label="Conflict and alternative feedback">
      <div className="conflict-header">
        <div className="conflict-badge-wrap">
          <span className="conflict-alert-icon">⚠️</span>
          <div>
            <h4 className="conflict-title">
              {status === 'conflict' ? 'Schedule Conflict Detected' : 'No Continuous Slot Found'}
            </h4>
            <p className="conflict-message">{message}</p>
          </div>
        </div>

        {onDismiss && (
          <button type="button" className="btn-dismiss-conflict" onClick={onDismiss} aria-label="Dismiss feedback">
            ×
          </button>
        )}
      </div>

      {conflictingBlock && (
        <div className="conflicting-block-card">
          <span className="card-subhead">Overlapping Commitment in MongoDB:</span>
          <div className="conflict-item-detail">
            <span className="conflict-block-title">📌 {conflictingBlock.title}</span>
            <span className="conflict-block-time">
              {formatUtcTime(conflictingBlock.startTime)} – {formatUtcTime(conflictingBlock.endTime)}
            </span>
          </div>
        </div>
      )}

      {alternativeSlots.length > 0 && (
        <div className="alternatives-section">
          <span className="card-subhead">Available Free Windows on This Day:</span>
          <div className="alternatives-grid">
            {alternativeSlots.map((slot, i) => (
              <div key={i} className="alternative-slot-card">
                <div className="alt-time">
                  {formatUtcTime(slot.startTime)} – {formatUtcTime(slot.endTime)}
                </div>
                <div className="alt-duration">
                  {slot.durationMinutes} min free
                </div>
                {onSelectAlternative && (
                  <button
                    type="button"
                    className="btn-use-alt"
                    onClick={() => onSelectAlternative(slot)}
                  >
                    Select Window
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
