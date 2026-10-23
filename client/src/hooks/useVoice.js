/**
 * useVoice — ORBITA Voice Hook
 *
 * Push-to-talk voice input using SpeechRecognition API.
 * Text-to-speech output via speechSynthesis.
 * States: idle | listening | processing | speaking | error
 *
 * Correctly cancels any ongoing speech when the user interrupts.
 * Prevents duplicate in-flight requests.
 *
 * Browser APIs are checked dynamically (not at module load) for testability.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

export const VOICE_STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
  ERROR: 'error',
};

// ─── Dynamic browser capability helpers ──────────────────────────────────────

function getSpeechRecognitionClass() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function canSynthesize() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Pick the best available voice for a language.
 * Prefers hi-IN for Hindi, en-US/en-IN otherwise.
 */
function pickVoice(lang = 'en') {
  if (!canSynthesize()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  if (lang === 'hi') {
    const hiVoice =
      voices.find(v => v.lang === 'hi-IN') ||
      voices.find(v => v.lang.startsWith('hi'));
    if (hiVoice) return hiVoice;
  }

  return (
    voices.find(v => v.lang === 'en-IN') ||
    voices.find(v => v.lang === 'en-US') ||
    voices.find(v => v.lang.startsWith('en')) ||
    voices[0]
  );
}

/**
 * Detect whether a transcript is predominantly Hindi/Hinglish.
 * Heuristic: contains common Hindi words.
 */
const HINDI_MARKERS = /\b(aaj|kya|mera|mere|schedule|ghanta|baje|pehle|baad|karein|karo|dikhao|khali|kab|hoon|hai|hain|nahi)\b/i;
function detectLang(text) {
  return HINDI_MARKERS.test(text) ? 'hi' : 'en';
}

/**
 * Strip markdown symbols and code blocks for clean text-to-speech.
 */
function cleanForSpeech(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, 'Here is the code.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/•\s*/g, '. ')
    .replace(/\n+/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function useVoice({ onTranscript }) {
  const [voiceState, setVoiceState] = useState(VOICE_STATES.IDLE);
  const [transcript, setTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognizerRef = useRef(null);
  const isRequestInFlightRef = useRef(false);
  const latestLangRef = useRef('en');
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // Check capabilities dynamically (evaluated per-render, cached via useMemo)
  const isSupported = useMemo(() => !!getSpeechRecognitionClass(), []);
  const hasTTS = useMemo(() => canSynthesize(), []);

  // Stop TTS immediately
  const stopSpeaking = useCallback(() => {
    if (canSynthesize()) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setVoiceState(VOICE_STATES.IDLE);
  }, []);

  // Speak a text string aloud
  const speak = useCallback((text, langHint = 'en') => {
    if (!canSynthesize()) return;

    window.speechSynthesis.cancel(); // cancel any ongoing speech first
    const cleanText = cleanForSpeech(text);
    if (!cleanText) return;

    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.rate = 0.97;
    utter.pitch = 1.0;
    utter.volume = 1.0;

    // Wait for voices to be loaded (needed on some browsers)
    const trySpeak = () => {
      const voice = pickVoice(langHint);
      if (voice) utter.voice = voice;
      utter.lang = langHint === 'hi' ? 'hi-IN' : 'en-IN';

      utter.onstart = () => {
        setIsSpeaking(true);
        setVoiceState(VOICE_STATES.SPEAKING);
      };
      utter.onend = () => {
        setIsSpeaking(false);
        setVoiceState(VOICE_STATES.IDLE);
      };
      utter.onerror = () => {
        setIsSpeaking(false);
        setVoiceState(VOICE_STATES.IDLE);
      };
      window.speechSynthesis.speak(utter);
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      trySpeak();
    } else {
      window.speechSynthesis.addEventListener('voiceschanged', trySpeak, { once: true });
    }
  }, []);

  // Speak the AI response text
  const speakResponse = useCallback((text) => {
    const lang = detectLang(text);
    speak(text, lang);
  }, [speak]);

  // Start push-to-talk listening
  const startListening = useCallback(() => {
    const SpeechRecClass = getSpeechRecognitionClass();
    if (!SpeechRecClass) {
      setErrorMessage('Speech recognition is not supported in this browser. Please use the text input below.');
      setVoiceState(VOICE_STATES.ERROR);
      return;
    }

    if (voiceState === VOICE_STATES.LISTENING || isRequestInFlightRef.current) return;

    // Cancel any ongoing speech before listening
    if (canSynthesize()) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setErrorMessage('');
    setTranscript('');
    setVoiceState(VOICE_STATES.LISTENING);

    const recognizer = new SpeechRecClass();
    recognizer.continuous = false;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
    // Support English and Hindi
    recognizer.lang = 'en-IN';

    recognizerRef.current = recognizer;

    recognizer.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }
      setTranscript((final + (interim ? ' ' + interim : '')).trim());
    };

    recognizer.onend = () => {
      recognizerRef.current = null;
      setVoiceState(prev => {
        if (prev === VOICE_STATES.LISTENING) {
          // Recognition finished normally — check if we have a transcript
          return VOICE_STATES.IDLE;
        }
        return prev;
      });
    };

    recognizer.onerror = (event) => {
      recognizerRef.current = null;

      switch (event.error) {
        case 'not-allowed':
        case 'permission-denied':
          setErrorMessage('Microphone access was denied. Please allow microphone access in your browser and try again.');
          break;
        case 'no-speech':
          setErrorMessage('No speech was detected. Please try speaking again.');
          break;
        case 'network':
          setErrorMessage('Network error during speech recognition. Check your connection and try again.');
          break;
        case 'audio-capture':
          setErrorMessage('No microphone was found. Please connect a microphone and try again.');
          break;
        case 'aborted':
          // User pressed stop — silent exit
          setVoiceState(VOICE_STATES.IDLE);
          return;
        default:
          setErrorMessage(`Speech recognition error: ${event.error}`);
      }
      setVoiceState(VOICE_STATES.ERROR);
    };

    recognizer.start();
  }, [voiceState]);

  // Stop listening manually — commit the current transcript
  const stopListening = useCallback(() => {
    if (recognizerRef.current) {
      recognizerRef.current.stop();
      recognizerRef.current = null;
    }
    setVoiceState(VOICE_STATES.IDLE);
  }, []);

  // Commit transcript to request pipeline
  const commitTranscript = useCallback(async (text) => {
    const trimmed = (text || transcript).trim();
    if (!trimmed || isRequestInFlightRef.current) return;

    latestLangRef.current = detectLang(trimmed);
    setVoiceState(VOICE_STATES.PROCESSING);
    isRequestInFlightRef.current = true;
    setTranscript('');

    try {
      if (onTranscriptRef.current) {
        await onTranscriptRef.current(trimmed);
      }
    } finally {
      isRequestInFlightRef.current = false;
      // State will be set to SPEAKING by speakResponse(), or back to IDLE if TTS is off
      setVoiceState(prev =>
        prev === VOICE_STATES.PROCESSING ? VOICE_STATES.IDLE : prev
      );
    }
  }, [transcript]);

  // Clear error
  const clearError = useCallback(() => {
    setErrorMessage('');
    setVoiceState(VOICE_STATES.IDLE);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognizerRef.current) {
        recognizerRef.current.abort();
      }
      if (canSynthesize()) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    voiceState,
    transcript,
    errorMessage,
    isSpeaking,
    isSupported,
    hasTTS,
    startListening,
    stopListening,
    commitTranscript,
    speakResponse,
    stopSpeaking,
    clearError,
    setTranscript,
    latestLang: latestLangRef.current,
  };
}
