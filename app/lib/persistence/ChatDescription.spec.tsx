import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatDescription } from './ChatDescription.client';
import { description } from '~/lib/persistence';

describe('ChatDescription', () => {
  it('names the tab after the chat and exposes labelled rename controls', () => {
    description.set('Todo app');

    const { unmount } = render(<ChatDescription />);

    expect(document.title).toBe('Todo app · Bolt');

    fireEvent.click(screen.getByRole('button', { name: 'Rename chat' }));
    expect(screen.getByRole('textbox', { name: 'Chat title' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save title' })).toBeTruthy();

    act(() => description.set(undefined));
    expect(document.title).toBe('Bolt');

    unmount();
  });
});
