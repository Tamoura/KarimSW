import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import CredentialCarousel from '@/components/CredentialCarousel';

// Use fake timers to control the 3.5s auto-advance interval
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('CredentialCarousel', () => {
  it('renders the first credential card', () => {
    render(<CredentialCarousel />);
    // cred.type appears twice (card body + bottom label)
    const items = screen.getAllByText('University Degree');
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('renders 6 navigation tab buttons', () => {
    render(<CredentialCarousel />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(6);
  });

  it('first tab is selected by default', () => {
    render(<CredentialCarousel />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('advances to the next card after 3.5 seconds', () => {
    render(<CredentialCarousel />);
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');

    act(() => {
      jest.advanceTimersByTime(3750); // interval (3500) + fade (250)
    });

    const tabs = screen.getAllByRole('tab');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('switches to a different card when a non-active tab is clicked', () => {
    render(<CredentialCarousel />);
    const tabs = screen.getAllByRole('tab');

    // Use fireEvent instead of userEvent to avoid async timer conflicts
    act(() => {
      fireEvent.click(tabs[2]);
      jest.advanceTimersByTime(300);
    });

    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('stays on current card when the active tab is clicked', () => {
    render(<CredentialCarousel />);
    const tabs = screen.getAllByRole('tab');

    act(() => {
      fireEvent.click(tabs[0]); // already active — handleDotClick returns early
      jest.advanceTimersByTime(300);
    });

    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });
});
