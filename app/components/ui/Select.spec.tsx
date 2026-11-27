import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

const options = [
  { value: 'light', label: 'Light', group: 'Light themes' },
  { value: 'dark', label: 'Dark', group: 'Dark themes' },
];

describe('Select', () => {
  it('shows the selected label, lists grouped options and reports the choice', () => {
    const onValueChange = vi.fn();

    render(<Select aria-label="Theme" value="light" onValueChange={onValueChange} options={options} />);

    const trigger = screen.getByRole('button', { name: 'Theme' });
    expect(trigger.textContent).toContain('Light');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    expect(screen.getByText('Dark themes')).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }));
    expect(onValueChange).toHaveBeenCalledWith('dark');
  });

  it('does not open when disabled', () => {
    render(<Select aria-label="Theme" value="light" onValueChange={vi.fn()} options={options} disabled />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Theme' }), { key: 'ArrowDown' });

    expect(screen.queryByRole('menuitemradio')).toBeNull();
  });
});
