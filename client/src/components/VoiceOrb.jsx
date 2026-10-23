import React, { useEffect, useRef } from 'react';
import { VOICE_STATES } from '../hooks/useVoice';

/**
 * VoiceOrb — The central animated ORBITA orb UI.
 *
 * Shows an animated sphere that reacts to voice states:
 *  - idle:       slow pulsing glow
 *  - listening:  active ripple rings + mic icon
 *  - processing: spinning orbit ring
 *  - speaking:   pulsing wave rings
 *  - error:      red tint
 */
export default function VoiceOrb({
  voiceState,
  transcript,
  isSpeaking,
  isSupported,
  onMicPress,
  onMicRelease,
  onStop,
  targetDate,
}) {
  const isListening = voiceState === VOICE_STATES.LISTENING;
  const isProcessing = voiceState === VOICE_STATES.PROCESSING;
  const isError = voiceState === VOICE_STATES.ERROR;
  const isIdle = voiceState === VOICE_STATES.IDLE;

  // Dynamic state label
  const stateLabel = {
    [VOICE_STATES.IDLE]: 'Tap to speak',
    [VOICE_STATES.LISTENING]: 'Listening…',
    [VOICE_STATES.PROCESSING]: 'Processing…',
    [VOICE_STATES.SPEAKING]: 'Speaking…',
    [VOICE_STATES.ERROR]: 'Error',
  }[voiceState] ?? 'Ready';

  const orbClass = [
    'voice-orb',
    `orb-${voiceState}`,
    isListening ? 'orb-active' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="voice-orb-section" aria-label="ORBITA voice interface">
      {/* Outer ring decorations */}
      <div className={`orb-outer-rings ${isListening ? 'rings-active' : ''} ${isSpeaking ? 'rings-speaking' : ''}`}>
        <div className="orb-ring ring-1" />
        <div className="orb-ring ring-2" />
        <div className="orb-ring ring-3" />
      </div>

      {/* Main orb button */}
      <button
        id="voice-orb-btn"
        className={orbClass}
        onClick={isListening ? onMicRelease : onMicPress}
        disabled={isProcessing}
        aria-label={isListening ? 'Stop listening' : 'Start listening — press to speak to ORBITA'}
        aria-pressed={isListening}
        title={isSupported ? stateLabel : 'Voice not supported in this browser'}
      >
        {/* Orb inner gradient sphere */}
        <span className="orb-sphere" aria-hidden="true">
          <span className="orb-core-glow" />
        </span>

        {/* State icon overlay */}
        <span className="orb-icon-overlay" aria-hidden="true">
          {isProcessing && <span className="orb-spinner" />}
          {!isProcessing && (
            <svg
              className={`orb-mic-icon ${isListening ? 'mic-on' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isSpeaking ? (
                /* Speaker wave icon when speaking */
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              ) : (
                /* Microphone icon */
                <>
                  <rect x="9" y="2" width="6" height="11" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </>
              )}
            </svg>
          )}
        </span>

        {/* Processing orbit animation */}
        {isProcessing && <span className="orb-orbit" aria-hidden="true" />}
      </button>

      {/* State label */}
      <div className="orb-state-label" aria-live="polite">
        <span className={`orb-state-text state-${voiceState}`}>{stateLabel}</span>
        {targetDate && isIdle && !transcript && (
          <span className="orb-date-hint">Date: {targetDate}</span>
        )}
      </div>

      {/* Live transcript display */}
      {transcript && (
        <div className="orb-transcript-bubble" aria-live="polite" id="voice-transcript-display">
          <span className="transcript-label">You said:</span>
          <p className="transcript-text">"{transcript}"</p>
          {isIdle && transcript && (
            <button
              className="btn-send-transcript"
              id="btn-send-transcript"
              onClick={() => onMicRelease(transcript)}
              aria-label="Send recognized speech"
            >
              Send ↗
            </button>
          )}
        </div>
      )}

      {/* Stop speaking button */}
      {isSpeaking && (
        <button
          className="btn-stop-speaking"
          id="btn-stop-speaking"
          onClick={onStop}
          aria-label="Stop ORBITA speaking"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
          Stop speaking
        </button>
      )}

      {/* Browser unsupported badge */}
      {!isSupported && (
        <div className="orb-unsupported-notice" role="note">
          ⚠ Voice input not available in this browser. Use the text input below.
        </div>
      )}
    </div>
  );
}
