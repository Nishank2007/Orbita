import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';
import * as api from '../api';

vi.mock('../api');

// Mock SpeechRecognition and speechSynthesis for JSDOM
beforeAll(() => {
  // SpeechRecognition mock
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

  // speechSynthesis mock
  global.speechSynthesis = {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  global.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; }
    onstart = null;
    onend = null;
    onerror = null;
  };
});

describe('App Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    api.checkBackendHealth.mockResolvedValue({
      status: 'ok',
      service: 'orbita-server',
      database: { status: 'connected' }
    });

    api.getDailySchedule.mockResolvedValue({
      date: '2026-10-22',
      count: 0,
      blocks: []
    });
  });

  it('renders header, datebar, voice orb, text input fallback, and initial empty timeline', async () => {
    render(<App />);

    // Header
    expect(screen.getByText('ORBITA')).toBeInTheDocument();
    expect(screen.getByText(/voice-first ai assistant/i)).toBeInTheDocument();

    // Voice orb button should be present
    expect(screen.getByRole('button', { name: /start listening/i })).toBeInTheDocument();

    // Text fallback textarea
    expect(screen.getByLabelText(/natural language scheduling prompt/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/no commitments scheduled/i)).toBeInTheDocument();
    });
  });

  it('executes text prompt submission, updates audit log, and performs post-creation refresh', async () => {
    const plannedBlock = {
      id: 'blk-fresh-100',
      title: 'Neural Network Deep Dive',
      startTime: '2026-10-22T14:00:00.000Z',
      endTime: '2026-10-22T15:00:00.000Z',
      category: 'focus',
      priority: 'high'
    };

    api.submitAgentPlan.mockResolvedValue({
      message: "I have scheduled 'Neural Network Deep Dive' from 14:00 UTC to 15:00 UTC.",
      mode: 'mock',
      status: 'success',
      auditLog: [
        {
          tool: 'find_available_slots',
          arguments: { date: '2026-10-22', duration: 60 },
          result: { status: 'success', slotsCount: 1 },
          status: 'ok'
        },
        {
          tool: 'create_schedule_block',
          arguments: { title: 'Neural Network Deep Dive' },
          result: { status: 'success', block: plannedBlock },
          status: 'ok'
        }
      ],
      block: plannedBlock
    });

    api.getDailySchedule
      .mockResolvedValueOnce({ date: '2026-10-22', count: 0, blocks: [] })
      .mockResolvedValueOnce({ date: '2026-10-22', count: 1, blocks: [plannedBlock] });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/no commitments scheduled/i)).toBeInTheDocument();
    });

    // Enter prompt via text fallback
    const input = screen.getByLabelText(/natural language scheduling prompt/i);
    fireEvent.change(input, { target: { value: 'Schedule 60 minutes for Neural Network Deep Dive after 2 PM' } });

    const submitBtn = screen.getByRole('button', { name: /ask agent/i });
    fireEvent.click(submitBtn);

    // Verify loading indicator is triggered
    expect(screen.getByText(/planning…/i)).toBeInTheDocument();

    // Verify agent response, audit panel, and refreshed block appear
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 4, name: 'Neural Network Deep Dive' })).toBeInTheDocument();
      expect(screen.getByText(/just created/i)).toBeInTheDocument();
      expect(screen.getByText(/find_available_slots/i)).toBeInTheDocument();
      expect(screen.getByText(/create_schedule_block/i)).toBeInTheDocument();
    });

    // Confirm getDailySchedule was called again for refresh
    expect(api.getDailySchedule).toHaveBeenCalledTimes(2);
  });

  it('renders conflict feedback when backend returns conflict', async () => {
    api.submitAgentPlan.mockResolvedValue({
      message: "Could not schedule because it overlaps with an existing block.",
      mode: 'mock',
      status: 'conflict',
      auditLog: [
        {
          tool: 'create_schedule_block',
          arguments: {},
          result: {
            status: 'conflict',
            conflictingBlock: {
              title: 'Executive Sync',
              startTime: '2026-10-22T14:00:00.000Z',
              endTime: '2026-10-22T15:00:00.000Z'
            }
          },
          status: 'ok'
        }
      ],
      block: null,
      schedule: null
    });

    render(<App />);

    const input = screen.getByLabelText(/natural language scheduling prompt/i);
    fireEvent.change(input, { target: { value: 'Schedule 60 minutes for Focus after 2 PM' } });

    const submitBtn = screen.getByRole('button', { name: /ask agent/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/schedule conflict detected/i)).toBeInTheDocument();
      expect(screen.getByText(/executive sync/i)).toBeInTheDocument();
    });
  });

  it('shows voice orb button with correct accessible state when idle', () => {
    render(<App />);
    const orbBtn = screen.getByRole('button', { name: /start listening/i });
    expect(orbBtn).not.toBeDisabled();
    expect(orbBtn).toHaveAttribute('aria-pressed', 'false');
  });
});
