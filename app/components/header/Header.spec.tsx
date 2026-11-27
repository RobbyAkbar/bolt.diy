import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

describe('Header', () => {
  it('toggles the sidebar from the header icon', () => {
    const onToggle = vi.fn();
    document.addEventListener('toggle-sidebar', onToggle);

    render(<Header />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));

    expect(onToggle).toHaveBeenCalledOnce();
    document.removeEventListener('toggle-sidebar', onToggle);
  });
});
