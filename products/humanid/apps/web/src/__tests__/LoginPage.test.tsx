import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/app/login/page';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockApiFetch = jest.fn();
const mockSetAccessToken = jest.fn();
jest.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  setAccessToken: (...args: unknown[]) => mockSetAccessToken(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResponse(body: object, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiFetch.mockReset();
    mockSetAccessToken.mockReset();
  });

  it('renders email and password inputs', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it('renders the Sign In button', () => {
    render(<LoginPage />);
    expect(
      screen.getByRole('button', { name: /sign in/i })
    ).toBeInTheDocument();
  });

  it('renders a link to the register page', () => {
    render(<LoginPage />);
    const link = screen.getByRole('link', { name: /create one for free/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/register');
  });

  it('toggles password visibility when toggle button is clicked', async () => {
    render(<LoginPage />);
    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleBtn = screen.getByRole('button', { name: /show password/i });
    await userEvent.click(toggleBtn);
    expect(passwordInput).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('redirects to /wallet on successful login', async () => {
    mockApiFetch.mockReturnValue(makeResponse({ access_token: 'tok-123' }));
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Pass1234!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSetAccessToken).toHaveBeenCalledWith('tok-123');
      expect(mockPush).toHaveBeenCalledWith('/wallet');
    });
  });

  it('shows error message on failed login', async () => {
    mockApiFetch.mockReturnValue(
      makeResponse({ detail: 'Invalid credentials' }, false)
    );
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email address/i), 'bad@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows connection error when fetch throws', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'pass');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not connect/i);
    });
  });

  it('disables the submit button while loading', async () => {
    mockApiFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'pass');

    const btn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn).toBeDisabled();
    });
  });
});
