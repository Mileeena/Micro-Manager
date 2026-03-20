import { vi } from 'vitest';

export const vscode = {
  postMessage: vi.fn(),
  getState: vi.fn(() => undefined),
  setState: vi.fn(),
};
