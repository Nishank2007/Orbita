import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Timeline from '../components/Timeline';

describe('Timeline Component', () => {
  it('renders empty state when there are no blocks', () => {
    render(
      <Timeline
        blocks={[]}
        isLoading={false}
        newlyCreatedId={null}
        selectedDate="2026-10-22"
      />
    );

    expect(screen.getByText(/no commitments scheduled/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-10-22/i)).toBeInTheDocument();
  });

  it('renders loading skeleton when isLoading is true', () => {
    render(
      <Timeline
        blocks={[]}
        isLoading={true}
        newlyCreatedId={null}
        selectedDate="2026-10-22"
      />
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/loading schedule for 2026-10-22/i)).toBeInTheDocument();
  });

  it('renders list of schedule blocks with categories, times, and durations', () => {
    const blocks = [
      {
        id: 'blk-1',
        title: 'Deep Learning Study',
        startTime: '2026-10-22T14:00:00.000Z',
        endTime: '2026-10-22T15:30:00.000Z',
        category: 'focus',
        priority: 'high'
      },
      {
        id: 'blk-2',
        title: 'Team Architecture Standup',
        startTime: '2026-10-22T16:00:00.000Z',
        endTime: '2026-10-22T16:30:00.000Z',
        category: 'meeting',
        priority: 'medium'
      }
    ];

    render(
      <Timeline
        blocks={blocks}
        isLoading={false}
        newlyCreatedId={null}
        selectedDate="2026-10-22"
      />
    );

    expect(screen.getByText('Deep Learning Study')).toBeInTheDocument();
    expect(screen.getByText('Team Architecture Standup')).toBeInTheDocument();
    expect(screen.getByText('Focus Session')).toBeInTheDocument();
    expect(screen.getByText('Meeting / Sync')).toBeInTheDocument();
    expect(screen.getByText('14:00 UTC')).toBeInTheDocument();
    expect(screen.getByText('15:30 UTC')).toBeInTheDocument();
    expect(screen.getByText(/90 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/30 minutes/i)).toBeInTheDocument();
  });

  it('highlights the newly created block with a badge', () => {
    const blocks = [
      {
        id: 'new-blk-999',
        title: 'New Physics Session',
        startTime: '2026-10-22T17:00:00.000Z',
        endTime: '2026-10-22T18:00:00.000Z',
        category: 'focus',
        priority: 'medium'
      }
    ];

    render(
      <Timeline
        blocks={blocks}
        isLoading={false}
        newlyCreatedId="new-blk-999"
        selectedDate="2026-10-22"
      />
    );

    expect(screen.getByText(/just created/i)).toBeInTheDocument();
  });
});
