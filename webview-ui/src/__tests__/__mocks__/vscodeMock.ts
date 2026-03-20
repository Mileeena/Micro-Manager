import { vi } from 'vitest';

export const mockPostMessage = vi.fn();
export const mockVscode = {
  postMessage: mockPostMessage,
  getState: vi.fn(() => undefined),
  setState: vi.fn(),
};
