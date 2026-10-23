import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AuditPanel from '../components/AuditPanel';

describe('AuditPanel Component', () => {
  it('renders awaiting state when audit log is empty', () => {
    render(
      <AuditPanel
        auditLog={[]}
        mode="mock"
        agentMessage={null}
      />
    );

    expect(screen.getByText(/awaiting agent execution/i)).toBeInTheDocument();
    expect(screen.getByText(/0 steps/i)).toBeInTheDocument();
    expect(screen.getByText(/mode: mock/i)).toBeInTheDocument();
  });

  it('renders agent speech message when provided', () => {
    render(
      <AuditPanel
        auditLog={[]}
        mode="mock"
        agentMessage="I have scheduled 'Deep Learning study' from 14:00 UTC to 15:00 UTC."
      />
    );

    expect(screen.getByText(/orbita agent:/i)).toBeInTheDocument();
    expect(screen.getByText(/i have scheduled 'deep learning study'/i)).toBeInTheDocument();
  });

  it('renders user question alongside agent message for side-by-side comparison', () => {
    render(
      <AuditPanel
        auditLog={[]}
        mode="mock"
        agentMessage="Tokyo is the capital of Japan."
        userQuestion="What is the capital of Japan?"
      />
    );

    expect(screen.getByText(/user question:/i)).toBeInTheDocument();
    expect(screen.getByText('What is the capital of Japan?')).toBeInTheDocument();
    expect(screen.getByText(/orbita agent:/i)).toBeInTheDocument();
    expect(screen.getByText('Tokyo is the capital of Japan.')).toBeInTheDocument();
  });

  it('renders all audit steps with tool names and status badges', () => {
    const auditLog = [
      {
        tool: 'find_available_slots',
        arguments: { date: '2026-10-22', duration: 60 },
        result: { status: 'success', slotsCount: 1 },
        status: 'ok'
      },
      {
        tool: 'create_schedule_block',
        arguments: { title: 'Deep Learning study', start_time: '2026-10-22T14:00:00.000Z' },
        result: { status: 'success', block: { id: 'blk-1' } },
        status: 'ok'
      }
    ];

    render(
      <AuditPanel
        auditLog={auditLog}
        mode="mock"
        agentMessage={null}
      />
    );

    expect(screen.getByText('find_available_slots')).toBeInTheDocument();
    expect(screen.getByText('create_schedule_block')).toBeInTheDocument();
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
    expect(screen.getAllByText('OK')).toHaveLength(2);
  });

  it('expands tool details when clicked', () => {
    const auditLog = [
      {
        tool: 'find_available_slots',
        arguments: { date: '2026-10-22', duration: 60 },
        result: { status: 'success', slotsCount: 1 },
        status: 'ok'
      }
    ];

    render(
      <AuditPanel
        auditLog={auditLog}
        mode="mock"
        agentMessage={null}
      />
    );

    // Initially details are hidden
    expect(screen.queryByText(/arguments \(mcp tool call\):/i)).not.toBeInTheDocument();

    // Click step bar
    const stepBar = screen.getByText('find_available_slots');
    fireEvent.click(stepBar);

    // Now details should be visible
    expect(screen.getByText(/arguments \(mcp tool call\):/i)).toBeInTheDocument();
    expect(screen.getByText(/result \(returned via mcp\):/i)).toBeInTheDocument();
  });
});
