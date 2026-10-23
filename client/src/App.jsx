import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import DateBar from './components/DateBar';
import VoiceOrb from './components/VoiceOrb';
import PromptInterface from './components/PromptInterface';
import Timeline from './components/Timeline';
import AuditPanel from './components/AuditPanel';
import ConflictFeedback from './components/ConflictFeedback';
import { useVoice, VOICE_STATES } from './hooks/useVoice';
import {
  getDailySchedule,
  submitAgentPlan,
  checkBackendHealth
} from './api';
import './components/VoiceOrb.css';
import './App.css';

export default function App() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scheduleBlocks, setScheduleBlocks] = useState([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);
  const [agentResponse, setAgentResponse] = useState(null);
  const [newlyCreatedBlockId, setNewlyCreatedBlockId] = useState(null);
  const [promptError, setPromptError] = useState(null);
  const [conflictState, setConflictState] = useState(null);
  const [backendHealth, setBackendHealth] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [voiceError, setVoiceError] = useState(null);
  const [lastUserQuestion, setLastUserQuestion] = useState(null);

  // Prevent duplicate concurrent requests & maintain conversation history
  const isRequestInFlightRef = useRef(false);
  const conversationHistoryRef = useRef([]);
  const voiceRef = useRef(null);

  // ─── Backend helpers ────────────────────────────────────────────────────────
  const loadHealth = useCallback(async () => {
    try {
      const data = await checkBackendHealth();
      setBackendHealth(data);
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  }, []);

  const loadSchedule = useCallback(async (date) => {
    setIsLoadingSchedule(true);
    try {
      const data = await getDailySchedule(date);
      setScheduleBlocks(data.blocks || []);
    } catch (err) {
      console.error('Failed to load schedule:', err);
    } finally {
      setIsLoadingSchedule(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    loadSchedule(selectedDate);
  }, [selectedDate, loadHealth, loadSchedule]);

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
    setNewlyCreatedBlockId(null);
    setConflictState(null);
  };

  // ─── Core prompt handler (shared by voice and text input) ──────────────────
  const handlePromptSubmit = useCallback(async (promptText) => {
    if (isRequestInFlightRef.current) return; // prevent duplicate

    isRequestInFlightRef.current = true;
    setIsSubmittingPrompt(true);
    setPromptError(null);
    setConflictState(null);
    setVoiceError(null);
    setLastUserQuestion(promptText);

    try {
      const res = await submitAgentPlan(
        promptText,
        'UTC',
        selectedDate,
        conversationHistoryRef.current
      );
      setAgentResponse(res);

      // Append exchange to multi-turn conversation history
      if (res?.message) {
        conversationHistoryRef.current = [
          ...conversationHistoryRef.current.slice(-10),
          { role: 'user', content: promptText },
          { role: 'model', content: res.message }
        ];
      }

      if (res.status === 'success') {
        const createdId = res.block?.id || res.block?._id;
        if (createdId) setNewlyCreatedBlockId(createdId);
        // Refresh schedule from database without full page reload
        await loadSchedule(selectedDate);
      } else if (res.status === 'conflict' || res.status === 'no_slot') {
        setConflictState({
          status: res.status,
          message: res.message,
          auditLog: res.auditLog || []
        });
      } else if (res.status === 'error') {
        setPromptError(res.message || 'Agent encountered an error executing schedule plan.');
      }

      return res;
    } catch (err) {
      const errMsg = err.message || 'Failed to communicate with ORBITA backend.';
      setPromptError(errMsg);
      setIsOnline(false);
      throw err;
    } finally {
      isRequestInFlightRef.current = false;
      setIsSubmittingPrompt(false);
    }
  }, [selectedDate, loadSchedule]);

  // ─── Voice: when transcript is committed, run the prompt + speak response ──
  const handleVoiceTranscript = useCallback(async (transcriptText) => {
    setVoiceError(null);
    let res;
    try {
      res = await handlePromptSubmit(transcriptText);
    } catch (err) {
      const msg = err.message || 'Backend error. Please try again.';
      setVoiceError(msg);
      if (voiceRef.current) {
        voiceRef.current.speakResponse('Sorry, I could not reach the backend. Please try again.');
      }
      return;
    }

    if (!res) return;

    // Speak the actual returned AI response aloud
    const textToSpeak = res.message || 'Done.';
    if (voiceRef.current) {
      voiceRef.current.speakResponse(textToSpeak);
    }
  }, [handlePromptSubmit]);

  // ─── Voice hook ─────────────────────────────────────────────────────────────
  const voice = useVoice({ onTranscript: handleVoiceTranscript });
  voiceRef.current = voice;

  // Handle mic button press — start recording
  const handleMicPress = useCallback(() => {
    if (isSubmittingPrompt) return;
    voice.startListening();
  }, [isSubmittingPrompt, voice]);

  // Handle mic release — stop + commit transcript
  const handleMicRelease = useCallback((overrideText) => {
    voice.stopListening();
    const text = typeof overrideText === 'string' ? overrideText : voice.transcript;
    if (text && text.trim().length >= 3) {
      voice.commitTranscript(text.trim());
    }
  }, [voice]);

  // Suggestion chip via voice — speak prompt aloud and submit
  const handleSelectAlternativeSlot = (slot) => {
    if (!slot) return;
    const startHour = slot.startTime.slice(11, 16);
    const endHour = slot.endTime.slice(11, 16);
    const duration = Math.min(slot.durationMinutes, 60);
    const suggestedPrompt = `Schedule ${duration} minutes for Focus session after ${startHour} before ${endHour} today`;
    handlePromptSubmit(suggestedPrompt).then(res => {
      if (res?.message && voiceRef.current) voiceRef.current.speakResponse(res.message);
    }).catch(() => {});
  };

  // Voice error display: merge voice hook error and voice-api error
  const displayVoiceError = voice.errorMessage || voiceError;

  return (
    <div className="orbita-app">
      <Header health={backendHealth} isOnline={isOnline} />

      <DateBar
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        onRefresh={() => loadSchedule(selectedDate)}
        blocksCount={scheduleBlocks.length}
        isLoading={isLoadingSchedule}
      />

      <main className="dashboard-grid">
        {/* ── Left column: Voice + Text Input + Conflict + Audit ── */}
        <section className="dashboard-left-col" aria-label="Agent Planning Controls">

          {/* Voice-first interaction card */}
          <div className="glass-panel voice-panel">
            {/* Orb */}
            <VoiceOrb
              voiceState={voice.voiceState}
              transcript={voice.transcript}
              isSpeaking={voice.isSpeaking}
              isSupported={voice.isSupported}
              onMicPress={handleMicPress}
              onMicRelease={handleMicRelease}
              onStop={voice.stopSpeaking}
              targetDate={selectedDate}
            />

            {/* Voice error */}
            {displayVoiceError && (
              <div className="voice-error-banner" role="alert" id="voice-error-banner">
                <div className="voice-error-content">
                  <strong>⚠ Voice Error</strong>
                  <p>{displayVoiceError}</p>
                </div>
                <button
                  className="btn-dismiss-voice-error"
                  onClick={() => { voice.clearError(); setVoiceError(null); }}
                  aria-label="Dismiss voice error"
                >
                  ×
                </button>
              </div>
            )}

            {/* Keyboard shortcut hint */}
            <p className="voice-shortcut-hint">
              {voice.isSupported
                ? <>Tap the orb to speak • <kbd>Space</kbd> to start / stop</>
                : 'Voice not supported — use text input below'}
            </p>

            {/* Divider to text fallback */}
            <div className="voice-panel-divider">
              <span className="divider-label">or type below</span>
            </div>

            {/* Text input fallback */}
            <PromptInterface
              onSubmit={handlePromptSubmit}
              isLoading={isSubmittingPrompt}
              error={promptError}
              onClearError={() => setPromptError(null)}
              targetDate={selectedDate}
            />
          </div>

          {conflictState && (
            <ConflictFeedback
              status={conflictState.status}
              message={conflictState.message}
              auditLog={conflictState.auditLog}
              onSelectAlternative={handleSelectAlternativeSlot}
              onDismiss={() => setConflictState(null)}
            />
          )}

          <AuditPanel
            auditLog={agentResponse?.auditLog || []}
            mode={agentResponse?.mode || 'mock'}
            agentMessage={agentResponse?.message}
            userQuestion={lastUserQuestion}
          />
        </section>

        {/* ── Right column: Schedule Timeline ── */}
        <section className="dashboard-right-col" aria-label="Schedule and Timeline">
          <Timeline
            blocks={scheduleBlocks}
            isLoading={isLoadingSchedule}
            newlyCreatedId={newlyCreatedBlockId}
            selectedDate={selectedDate}
          />
        </section>
      </main>
    </div>
  );
}
