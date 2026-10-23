/**
 * useVoice.test.js
 *
 * Tests for the useVoice hook covering:
 * - Initial state
 * - Start / stop listening
 * - Microphone permission denied error
 * - No-speech error
 * - Unsupported browser
 * - TTS speakResponse (mocked)
 * - Repeated requests prevention
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// ─── Mock SpeechRecognition ────────────────────────────────────────────────────

let mockRecognitionInstance = null;

function createMockRecognitionClass() {
  return class MockRecognition {
    constructor() {
      mockRecognitionInstance = this;
      this.lang = 'en-IN';
      this.continuous = false;
      this.interimResults = true;
      this.maxAlternatives = 1;
      this.onresult = null;
      this.onend = null;
      this.onerror = null;
      this.started = false;
    }
    start() { this.started = true; }
    stop()  { if (this.onend) this.onend(); }
    abort() { if (this.onend) this.onend(); }
  };
}

// ─── Mock speechSynthesis ─────────────────────────────────────────────────────

const mockSpeakFn = vi.fn();
const mockCancelFn = vi.fn();

// Set up browser API mocks BEFORE module import
beforeAll(() => {
  global.SpeechRecognition = createMockRecognitionClass();
  global.webkitSpeechRecognition = global.SpeechRecognition;

  global.speechSynthesis = {
    speak: mockSpeakFn,
    cancel: mockCancelFn,
    getVoices: () => [{ lang: 'en-US', name: 'Test Voice' }],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  global.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; this.rate = 1; this.pitch = 1; this.volume = 1; }
    onstart = null; onend = null; onerror = null;
    set voice(_v) {}
    set lang(_l) {}
  };
});

// Import AFTER mocks are in place
const { useVoice, VOICE_STATES } = await import('../hooks/useVoice');

beforeEach(() => {
  mockRecognitionInstance = null;
  vi.clearAllMocks();
  mockSpeakFn.mockClear();
  mockCancelFn.mockClear();
});

describe('useVoice hook', () => {
  // ── Initial state ────────────────────────────────────────────────────────

  it('starts in idle state with empty transcript', () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoice({ onTranscript }));

    expect(result.current.voiceState).toBe(VOICE_STATES.IDLE);
    expect(result.current.transcript).toBe('');
    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.isSupported).toBe(true);
    expect(result.current.hasTTS).toBe(true);
  });

  // ── startListening ───────────────────────────────────────────────────────

  it('transitions to LISTENING state on startListening()', () => {
    const { result } = renderHook(() => useVoice({ onTranscript: vi.fn() }));

    act(() => { result.current.startListening(); });

    expect(result.current.voiceState).toBe(VOICE_STATES.LISTENING);
    expect(mockCancelFn).toHaveBeenCalled(); // should cancel any TTS first
  });

  it('does not start a second recognition session while already listening', () => {
    const { result } = renderHook(() => useVoice({ onTranscript: vi.fn() }));

    act(() => { result.current.startListening(); });
    const first = mockRecognitionInstance;

    act(() => { result.current.startListening(); }); // second call ignored
    expect(mockRecognitionInstance).toBe(first); // same instance
    expect(result.current.voiceState).toBe(VOICE_STATES.LISTENING);
  });

  // ── stopListening ────────────────────────────────────────────────────────

  it('returns to IDLE on stopListening()', () => {
    const { result } = renderHook(() => useVoice({ onTranscript: vi.fn() }));

    act(() => { result.current.startListening(); });
    act(() => { result.current.stopListening(); });

    expect(result.current.voiceState).toBe(VOICE_STATES.IDLE);
  });

  // ── Microphone permission denied ─────────────────────────────────────────

  it('sets ERROR state and message on permission denied', () => {
    const { result } = renderHook(() => useVoice({ onTranscript: vi.fn() }));

    act(() => { result.current.startListening(); });

    act(() => {
      mockRecognitionInstance.onerror({ error: 'not-allowed' });
    });

    expect(result.current.voiceState).toBe(VOICE_STATES.ERROR);
    expect(result.current.errorMessage).toMatch(/microphone access was denied/i);
  });

  // ── No-speech error ──────────────────────────────────────────────────────

  it('sets ERROR state and message on no-speech error', () => {
    const { result } = renderHook(() => useVoice({ onTranscript: vi.fn() }));

    act(() => { result.current.startListening(); });
    act(() => { mockRecognitionInstance.onerror({ error: 'no-speech' }); });

    expect(result.current.voiceState).toBe(VOICE_STATES.ERROR);
    expect(result.current.errorMessage).toMatch(/no speech was detected/i);
  });

  // ── clearError ───────────────────────────────────────────────────────────

  it('clearError resets to IDLE and clears message', () => {
    const { result } = renderHook(() => useVoice({ onTranscript: vi.fn() }));

    act(() => { result.current.startListening(); });
    act(() => { mockRecognitionInstance.onerror({ error: 'no-speech' }); });
    act(() => { result.current.clearError(); });

    expect(result.current.voiceState).toBe(VOICE_STATES.IDLE);
    expect(result.current.errorMessage).toBe('');
  });

  // ── speakResponse ────────────────────────────────────────────────────────

  it('calls speechSynthesis.speak when speakResponse() is called', () => {
    const { result } = renderHook(() => useVoice({ onTranscript: vi.fn() }));

    act(() => { result.current.speakResponse('Your meeting is scheduled.'); });

    expect(mockSpeakFn).toHaveBeenCalledTimes(1);
    const utter = mockSpeakFn.mock.calls[0][0];
    expect(utter.text).toContain('Your meeting is scheduled');
  });

  it('strips markdown before speaking', () => {
    const { result } = renderHook(() => useVoice({ onTranscript: vi.fn() }));

    act(() => { result.current.speakResponse('**Bold** and `code` and ## Heading text'); });

    expect(mockSpeakFn).toHaveBeenCalledTimes(1);
    const utter = mockSpeakFn.mock.calls[0][0];
    expect(utter.text).not.toContain('**');
    expect(utter.text).not.toContain('##');
    expect(utter.text).not.toContain('`');
  });

  it('cancels existing speech before starting new TTS', () => {
    const { result } = renderHook(() => useVoice({ onTranscript: vi.fn() }));

    act(() => { result.current.speakResponse('First response.'); });
    act(() => { result.current.speakResponse('Second response.'); });

    // cancel should have been called at least twice (once per speak call)
    expect(mockCancelFn).toHaveBeenCalledTimes(2);
  });

  // ── stopSpeaking ─────────────────────────────────────────────────────────

  it('calls speechSynthesis.cancel on stopSpeaking()', () => {
    const { result } = renderHook(() => useVoice({ onTranscript: vi.fn() }));

    act(() => { result.current.stopSpeaking(); });

    expect(mockCancelFn).toHaveBeenCalled();
    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.voiceState).toBe(VOICE_STATES.IDLE);
  });

  // ── commitTranscript ─────────────────────────────────────────────────────

  it('calls onTranscript when commitTranscript is invoked', async () => {
    const onTranscript = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useVoice({ onTranscript }));

    await act(async () => {
      await result.current.commitTranscript('Schedule 60 minutes for Physics');
    });

    expect(onTranscript).toHaveBeenCalledWith('Schedule 60 minutes for Physics');
  });

  it('prevents duplicate commitTranscript calls while one is in flight', async () => {
    let resolve;
    const onTranscript = vi.fn(() => new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => useVoice({ onTranscript }));

    // Manually set a transcript
    act(() => { result.current.setTranscript('Schedule 60 min'); });

    // Fire two commits — second should be blocked since first is in-flight
    const p1 = act(async () => {
      result.current.commitTranscript('Schedule 60 min');
    });
    // This call should be blocked by the in-flight guard
    act(() => { result.current.commitTranscript('Schedule 60 min again'); });

    resolve();
    await p1;

    // Only one call should go through
    expect(onTranscript).toHaveBeenCalledTimes(1);
  });

  // ── Unsupported browser (separate describe to isolate globals) ───────────

  it('reports error when SpeechRecognition is absent and startListening is called', () => {
    // Temporarily remove the global
    const saved = global.SpeechRecognition;
    const savedWebkit = global.webkitSpeechRecognition;
    delete global.SpeechRecognition;
    delete global.webkitSpeechRecognition;

    const { result } = renderHook(() => useVoice({ onTranscript: vi.fn() }));

    act(() => { result.current.startListening(); });
    expect(result.current.voiceState).toBe(VOICE_STATES.ERROR);
    expect(result.current.errorMessage).toMatch(/not supported/i);

    // Restore
    global.SpeechRecognition = saved;
    global.webkitSpeechRecognition = savedWebkit;
  });
});
