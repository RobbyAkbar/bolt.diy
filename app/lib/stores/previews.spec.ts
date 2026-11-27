import type { WebContainer } from '@webcontainer/api';
import { describe, expect, it } from 'vitest';
import { PreviewsStore } from './previews';

describe('PreviewsStore', () => {
  it('does not wrap localStorage.setItem (the wrapper broadcast every key and clobbered other tabs)', () => {
    const setItemBefore = localStorage.setItem;

    new PreviewsStore(new Promise<WebContainer>(() => undefined));

    expect(localStorage.setItem).toBe(setItemBefore);
  });
});
