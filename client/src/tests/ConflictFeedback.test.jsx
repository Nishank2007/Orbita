import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConflictFeedback from '../components/ConflictFeedback';

describe('ConflictFeedback Component', () => {
  it('renders nothing when status is success or info', () => {
    const { container } = render(
      <ConflictFeedback
        status="success"
        message="Scheduled successfully"
        auditLog={[]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders conflict message and conflicting block details', () => {
    const auditLog = [
      {
        tool: 'create_schedule_block',
        arguments: {},
        result: {
          status: 'conflict',
          conflictingBlock: {
            title: 'Team Standup',
            startTime: '2026-10-22T14:00:00.000Z',
            endTime: '2026-10-22T15:00:00.000Z'
          }
        }
      }
    ];

    render(
      <ConflictFeedback
        status="conflict"
        message="The requested block overlaps with an existing schedule block."
        auditLog={auditLog}
      />
    );

    expect(screen.getByText(/schedule conflict detected/i)).toBeInTheDocument();
    expect(screen.getByText(/the requested block overlaps/i)).toBeInTheDocument();
    expect(screen.getByText(/team standup/i)).toBeInTheDocument();
    expect(screen.getByText('14:00 UTC – 15:00 UTC')).toBeInTheDocument();
  });

  it('renders alternative free windows when available', () => {
    const auditLog = [
      {
        tool: 'find_available_slots',
        arguments: {},
        result: {
          status: 'success',
          availableSlots: [
            {
              startTime: '2026-10-22T15:00:00.000Z',
              endTime: '2026-10-22T17:00:00.000Z',
              durationMinutes: 120
            }
          ]
        }
      }
    ];

    const handleSelect = vi.fn();

    render(
      <ConflictFeedback
        status="no_slot"
        message="No continuous slot found."
        auditLog={auditLog}
        onSelectAlternative={handleSelect}
      />
    );

    expect(screen.getByRole('heading', { level: 4, name: /no continuous slot found/i })).toBeInTheDocument();
    expect(screen.getByText(/available free windows on this day:/i)).toBeInTheDocument();
    expect(screen.getByText('15:00 UTC – 17:00 UTC')).toBeInTheDocument();
    expect(screen.getByText('120 min free')).toBeInTheDocument();

    const selectBtn = screen.getByRole('button', { name: /select window/i });
    fireEvent.click(selectBtn);
    expect(handleSelect).toHaveBeenCalledWith(auditLog[0].result.availableSlots[0]);
  });
});
