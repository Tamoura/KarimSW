import React from 'react';
import { render, screen } from '@testing-library/react';
import PlaceholderPage from '@/components/PlaceholderPage';

describe('PlaceholderPage', () => {
  it('renders title and description', () => {
    render(
      <PlaceholderPage
        title="Test Feature"
        description="This feature is coming soon."
      />
    );
    expect(screen.getByText('Test Feature')).toBeInTheDocument();
    expect(screen.getByText('This feature is coming soon.')).toBeInTheDocument();
  });

  it('shows "Coming Soon" badge', () => {
    render(
      <PlaceholderPage title="X" description="Y" />
    );
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('renders back link when backLink prop is provided', () => {
    render(
      <PlaceholderPage
        title="X"
        description="Y"
        backLink={{ href: '/home', label: 'Back to Home' }}
      />
    );
    const link = screen.getByRole('link', { name: /back to home/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/home');
  });

  it('does not render back link when backLink is omitted', () => {
    render(<PlaceholderPage title="X" description="Y" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
