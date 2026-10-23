/**
 * VoiceOrb.test.jsx
 *
 * Tests for the VoiceOrb component and voice UI states.
 * SpeechRecognition and speechSynthesis are mocked for JSDOM.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import VoiceOrb from '../components/VoiceOrb';
import { VOICE_STATES } from '../hooks/useVoice';

// ─── Browser API stubs ─────────────────────────────────────────────────────────
beforeAll(() => {
  const MockSpeechRecognition = class {
    lang = 'en-IN';
    continuous = false;
    interimResults = true;
    maxAlternatives = 1;
    onresult = null;
    onend = null;
    onerror = null;
    start() {}
    stop() {}
    abort() {}
  };
  global.SpeechRecognition = MockSpeechRecognition;
  global.webkitSpeechRecognition = MockSpeechRecognition;

  global.speechSynthesis = {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  global.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; }
    onstart = null; onend = null; onerror = null;
  };
});

const defaultProps = {
  voiceState: VOICE_STATES.IDLE,
  transcript: '',
  isSpeaking: false,
  isSupported: true,
  onMicPress: vi.fn(),
  onMicRelease: vi.fn(),
  onStop: vi.fn(),
  targetDate: '2026-10-22',
};

describe('VoiceOrb Component', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── State rendering ────────────────────────────────────────────────────────

  it('renders the orb button in idle state with correct label', () => {
    render(<VoiceOrb {...defaultProps} />);
    expect(screen.getByRole('button', { name: /start listening/i })).toBeInTheDocument();
    expect(screen.getByText('Tap to speak')).toBeInTheDocument();
  });

  it('shows "Listening…" state label and aria-pressed=true when listening', () => {
    render(<VoiceOrb {...defaultProps} voiceState={VOICE_STATES.LISTENING} />);
    expect(screen.getByText('Listening…')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /stop listening/i });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows "Processing…" label and disables button while processing', () => {
    render(<VoiceOrb {...defaultProps} voiceState={VOICE_STATES.PROCESSING} />);
    expect(screen.getByText('Processing…')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /start listening/i });
    expect(btn).toBeDisabled();
  });

  it('shows "Speaking…" label and stop-speaking button while speaking', () => {
    render(<VoiceOrb {...defaultProps} voiceState={VOICE_STATES.SPEAKING} isSpeaking={true} />);
    expect(screen.getByText('Speaking…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop orbita speaking/i })).toBeInTheDocument();
  });

  it('shows "Error" state label when in error state', () => {
    render(<VoiceOrb {...defaultProps} voiceState={VOICE_STATES.ERROR} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  // ── Interaction ────────────────────────────────────────────────────────────

  it('calls onMicPress when orb button is clicked in idle state', () => {
    const onMicPress = vi.fn();
    render(<VoiceOrb {...defaultProps} onMicPress={onMicPress} />);
    fireEvent.click(screen.getByRole('button', { name: /start listening/i }));
    expect(onMicPress).toHaveBeenCalledTimes(1);
  });

  it('calls onMicRelease when orb button is clicked in listening state', () => {
    const onMicRelease = vi.fn();
    render(
      <VoiceOrb
        {...defaultProps}
        voiceState={VOICE_STATES.LISTENING}
        onMicRelease={onMicRelease}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /stop listening/i }));
    expect(onMicRelease).toHaveBeenCalledTimes(1);
  });

  it('calls onStop when stop-speaking button is clicked', () => {
    const onStop = vi.fn();
    render(
      <VoiceOrb
        {...defaultProps}
        voiceState={VOICE_STATES.SPEAKING}
        isSpeaking={true}
        onStop={onStop}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /stop orbita speaking/i }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  // ── Transcript display ─────────────────────────────────────────────────────

  it('displays recognized transcript in a bubble', () => {
    render(
      <VoiceOrb
        {...defaultProps}
        voiceState={VOICE_STATES.IDLE}
        transcript="Schedule 60 minutes for Physics study"
      />
    );
    expect(screen.getByText(/schedule 60 minutes for physics study/i)).toBeInTheDocument();
    expect(screen.getByText(/you said:/i)).toBeInTheDocument();
  });

  it('shows "Send" button when idle with a transcript', () => {
    render(
      <VoiceOrb
        {...defaultProps}
        voiceState={VOICE_STATES.IDLE}
        transcript="Schedule 60 minutes"
      />
    );
    expect(screen.getByRole('button', { name: /send recognized speech/i })).toBeInTheDocument();
  });

  it('calls onMicRelease with transcript text when Send is clicked', () => {
    const onMicRelease = vi.fn();
    const text = 'Schedule 60 minutes for Physics';
    render(
      <VoiceOrb
        {...defaultProps}
        voiceState={VOICE_STATES.IDLE}
        transcript={text}
        onMicRelease={onMicRelease}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /send recognized speech/i }));
    expect(onMicRelease).toHaveBeenCalledWith(text);
  });

  // ── Unsupported browser notice ─────────────────────────────────────────────

  it('shows unsupported notice when isSupported is false', () => {
    render(<VoiceOrb {...defaultProps} isSupported={false} />);
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.getByText(/voice input not available/i)).toBeInTheDocument();
  });

  it('does not show unsupported notice when isSupported is true', () => {
    render(<VoiceOrb {...defaultProps} isSupported={true} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
