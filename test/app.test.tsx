/**
 * Smoke test: the app must render without a loaded keymap and without
 * crashing on the first interaction.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../src/App';

describe('app', () => {
  it('renders the empty state', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /load/i })).toBeTruthy();
    expect(screen.getByText(/No layout loaded/i)).toBeTruthy();
  });

  it('lets the user type a repository', () => {
    render(<App />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThan(0);
    fireEvent.change(inputs[0], { target: { value: 'someone' } });
    expect((inputs[0] as HTMLInputElement).value).toBe('someone');
  });
});
