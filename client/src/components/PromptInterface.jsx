import React, { useState } from 'react';

const SUGGESTIONS = [
  'Schedule 60 minutes for Deep Learning study after 2 PM before 5 PM today',
  'Schedule 90 minutes for React UI architecture before 4 PM high priority',
  'Book 30 minutes for Team Standup meeting at 9 AM',
  'Schedule 45 minutes for Gym routine after 6 PM',
  'What is my schedule today?',
];

/**
 * PromptInterface — text-input fallback for voice interaction.
 * The primary interaction is via VoiceOrb; this is a secondary accessibility
 * and browser-fallback interface embedded below the orb.
 */
export default function PromptInterface({
  onSubmit,
  isLoading,
  error,
  onClearError,
  targetDate
}) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e) => {
    e?.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed);
    setPrompt('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChipClick = (suggestion) => {
    setPrompt(suggestion);
  };

  return (
    <div className="prompt-card-compact" id="text-fallback-panel">
      {/* Target date */}
      <div className="target-date-pill" title="Target calendar date passed to agent">
        <span className="target-date-label">Target Date:</span>
        <span className="target-date-value">{targetDate}</span>
      </div>

      {/* Error display */}
      {error && (
        <div className="error-banner" role="alert" id="agent-error-banner">
          <div className="error-icon">⚠</div>
          <div className="error-content">
            <strong className="error-title">Error:</strong>
            <p className="error-message">{error}</p>
          </div>
          <button
            type="button"
            className="error-dismiss-btn"
            onClick={onClearError}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="prompt-form">
        <div className="textarea-container">
          <textarea
            id="prompt-input"
            className="prompt-textarea"
            placeholder="e.g. Schedule 60 min for Physics study after 2 PM before 5 PM"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={isLoading}
            aria-label="Natural language scheduling prompt"
          />
          <div className="prompt-actions-bar">
            <span className="char-hint">
              {prompt.length}/500 • <kbd>Enter</kbd> to send
            </span>
            <button
              type="submit"
              className={`btn-submit-prompt ${isLoading ? 'btn-loading' : ''}`}
              disabled={isLoading || prompt.trim().length < 3}
              id="btn-submit-prompt"
            >
              {isLoading ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>Planning…</span>
                </>
              ) : (
                <>
                  <span>Ask Agent</span>
                  <span className="btn-arrow" aria-hidden="true">→</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Example chips */}
      <div className="prompt-suggestions">
        <span className="suggestions-label">Try an example:</span>
        <div className="chip-container">
          {SUGGESTIONS.map((sugg, i) => (
            <button
              key={i}
              type="button"
              className="suggestion-chip"
              onClick={() => handleChipClick(sugg)}
              disabled={isLoading}
            >
              {sugg}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
