import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PromptInterface from '../components/PromptInterface';

describe('PromptInterface Component', () => {
  it('renders input field, submit button, and example chips', () => {
    render(
      <PromptInterface
        onSubmit={vi.fn()}
        isLoading={false}
        error={null}
        onClearError={vi.fn()}
        targetDate="2026-10-22"
      />
    );

    expect(screen.getByLabelText(/natural language scheduling prompt/i)).toBeInTheDocument();
    // Button label changed to "Ask Agent" in voice-first design
    expect(screen.getByRole('button', { name: /ask agent/i })).toBeInTheDocument();
    expect(screen.getByText(/target date:/i)).toBeInTheDocument();
    expect(screen.getByText('2026-10-22')).toBeInTheDocument();
    expect(screen.getByText(/schedule 60 minutes for deep learning study/i)).toBeInTheDocument();
  });

  it('disables submit button when prompt is under 3 characters', () => {
    render(
      <PromptInterface
        onSubmit={vi.fn()}
        isLoading={false}
        error={null}
        onClearError={vi.fn()}
        targetDate="2026-10-22"
      />
    );

    const submitBtn = screen.getByRole('button', { name: /ask agent/i });
    expect(submitBtn).toBeDisabled();

    const input = screen.getByLabelText(/natural language scheduling prompt/i);
    fireEvent.change(input, { target: { value: 'hi' } });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Schedule 60 min focus' } });
    expect(submitBtn).toBeEnabled();
  });

  it('calls onSubmit with entered text when submitted', () => {
    const handleSubmit = vi.fn();
    render(
      <PromptInterface
        onSubmit={handleSubmit}
        isLoading={false}
        error={null}
        onClearError={vi.fn()}
        targetDate="2026-10-22"
      />
    );

    const input = screen.getByLabelText(/natural language scheduling prompt/i);
    fireEvent.change(input, { target: { value: 'Schedule 45 min workout after 5 PM' } });

    const submitBtn = screen.getByRole('button', { name: /ask agent/i });
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledWith('Schedule 45 min workout after 5 PM');
  });

  it('clears textarea after submit', () => {
    const handleSubmit = vi.fn();
    render(
      <PromptInterface
        onSubmit={handleSubmit}
        isLoading={false}
        error={null}
        onClearError={vi.fn()}
        targetDate="2026-10-22"
      />
    );

    const input = screen.getByLabelText(/natural language scheduling prompt/i);
    fireEvent.change(input, { target: { value: 'Schedule 45 min workout after 5 PM' } });
    fireEvent.click(screen.getByRole('button', { name: /ask agent/i }));
    expect(input.value).toBe('');
  });

  it('populates textarea when clicking a suggestion chip', () => {
    render(
      <PromptInterface
        onSubmit={vi.fn()}
        isLoading={false}
        error={null}
        onClearError={vi.fn()}
        targetDate="2026-10-22"
      />
    );

    const chip = screen.getByText(/schedule 45 minutes for gym routine after 6 pm/i);
    fireEvent.click(chip);

    const input = screen.getByLabelText(/natural language scheduling prompt/i);
    expect(input.value).toBe('Schedule 45 minutes for Gym routine after 6 PM');
  });

  it('renders loading state and disables inputs when isLoading is true', () => {
    render(
      <PromptInterface
        onSubmit={vi.fn()}
        isLoading={true}
        error={null}
        onClearError={vi.fn()}
        targetDate="2026-10-22"
      />
    );

    expect(screen.getByText(/planning…/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/natural language scheduling prompt/i)).toBeDisabled();
  });

  it('displays error banner and triggers onClearError on dismiss', () => {
    const handleClear = vi.fn();
    render(
      <PromptInterface
        onSubmit={vi.fn()}
        isLoading={false}
        error="Agent timed out after 10000ms"
        onClearError={handleClear}
        targetDate="2026-10-22"
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Agent timed out after 10000ms')).toBeInTheDocument();

    const dismissBtn = screen.getByLabelText(/dismiss error/i);
    fireEvent.click(dismissBtn);
    expect(handleClear).toHaveBeenCalledTimes(1);
  });
});
